"""Native ORBIT p-dit (categorical) backend, adapting the local ORBIT SDK's ``MIQPProblem``.

Confirmed by source inspection of the locally installed orbit-sdk (``problems/miqp.py``,
``toolkit/graph.py``, and ``orbit_simulator``'s ``replica.py``): a constraint of the form
``sum(x_i) == 1`` with unit coefficients is auto-detected as a "PDIT group" and is *not*
compiled into a penalty term. Instead the simulator's replica step performs a genuine joint
categorical (softmax) draw across all group members every sweep — real multi-state p-dit
sampling, not a one-hot QUBO in disguise. This is exercised directly by the SDK's own
``tests/test_miqp.py`` and by ``replica.py``'s explicit "PDIT group" / "softmax" code path.

Known SDK gap (orbit-sdk beta ``MIQPProblem``, confirmed by reading ``problems/base.py`` vs
``problems/miqp.py``): ``MIQPProblem.model_post_init`` overrides the base class's and never
calls ``generate_adjacency_for_miqp`` / ``generate_update_groups``, so ``problem.adjacency``
raises ``AttributeError`` before ``SimulatorSolver.solve()`` can run. This backend closes that
gap using the SDK's own public graph utilities (the same ones the SDK's test suite imports) —
it does not modify orbit_sdk, monkeypatch its behaviour, or fall back to a QUBO encoding.
"""

from __future__ import annotations

import time
import warnings

from ..base import SolverConfig
from .backend import BackendResponse, OrbitExecutionMode
from .pdit_encoding import CategoricalAssignmentModel, _variable_name


def build_miqp_problem(model: CategoricalAssignmentModel):
    from orbit_sdk.problems import MIQPProblem

    objective: dict = dict(model.unary)
    objective.update(model.pairwise)
    constraints = {
        f"pdit::{task}": ({_variable_name(uav, task): 1.0 for uav in uavs}, "=", 1.0)
        for task, uavs in model.task_states.items()
    }
    variables = {name: ("b", 0, 1) for name in model.variable_order}
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", UserWarning)  # orbit_sdk's own "MIQPProblem is beta" notice
        problem = MIQPProblem(objective=objective, constraints=constraints, variables=variables, definitions={})
    return problem


def _complete_miqp_graph_construction(problem) -> None:
    """Populate ``_adjacency``/``_update_groups``, which this SDK version's MIQP
    ``model_post_init`` does not compute (see module docstring)."""
    from orbit_sdk.toolkit.graph import generate_adjacency_for_miqp, generate_update_groups

    problem._adjacency = generate_adjacency_for_miqp(problem)
    problem._update_groups = generate_update_groups(problem._adjacency, miqp=problem)


class OrbitPditSimulatorBackend:
    """Adapter around the local ORBIT SDK simulator's native MIQP/PDIT solve path."""

    mode = OrbitExecutionMode.SIMULATOR

    def __init__(self, config: SolverConfig):
        self.config = config

    def optimise(self, model: CategoricalAssignmentModel) -> BackendResponse:
        try:
            import numpy as np  # noqa: F401  (surface the same ImportError style as the p-bit backend)
            from orbit_sdk.models import AdvancedSolverParams, SolverParams
            from orbit_sdk.solvers import SimulatorSolver
        except ImportError as exc:
            raise NotImplementedError(
                "Install the optional ORBIT SDK and simulator; see README.md, ORBIT setup."
            ) from exc

        construction_started = time.perf_counter()
        problem = build_miqp_problem(model)
        _complete_miqp_graph_construction(problem)
        params = SolverParams(
            full_sweeps=self.config.orbit_full_sweeps,
            beta_start=self.config.orbit_beta_start,
            beta_end=self.config.orbit_beta_end,
            beta_step_interval=self.config.orbit_beta_step_interval,
            advanced=AdvancedSolverParams(
                n_replicas=self.config.orbit_replicas,
                n_processes=self.config.orbit_processes,
                log_level="WARNING",
                timeout=self.config.timeout_seconds or 300.0,
            ),
        )
        construction_finished = time.perf_counter()
        setup_started = construction_finished
        solver = SimulatorSolver()
        solver.connect()
        setup_finished = time.perf_counter()
        execution_started = setup_finished
        try:
            sdk_result = solver.solve(problem, params).result(timeout=self.config.timeout_seconds)
        finally:
            solver.disconnect()
        execution_finished = time.perf_counter()
        extraction_started = execution_finished

        order = [problem.idx_to_var[i] for i in range(problem.n_pbits)]
        samples = tuple({name: int(value) for name, value in zip(order, row)} for row in sdk_result.samples)
        best = {name: int(value) for name, value in zip(order, sdk_result.min_state)}
        violations = sum(
            1 for row in sdk_result.samples for group in problem.pdit_groups if sum(row[i] for i in group) != 1
        )
        extraction_finished = time.perf_counter()
        return BackendResponse(samples, {
            "best_sample": best,
            "minimum_miqp_energy": float(sdk_result.min_energy),
            "number_of_samples": int(sdk_result.samples.shape[0]),
            "number_of_pbits": int(problem.n_pbits),
            "number_of_pdit_groups": len(problem.pdit_groups),
            "sdk_backend": "SimulatorSolver (MIQPProblem/PDIT)",
            "native_pdit_execution": True,
            "pdit_constraint_violations_across_all_samples": violations,
            "sdk_adjacency_workaround_applied": True,
            "requested_seed": self.config.seed,
            "seed_applied": False,
            "seed_note": "orbit-sdk does not expose simulator random_seed through SolverParams",
            "full_sweeps": self.config.orbit_full_sweeps,
            "n_replicas": self.config.orbit_replicas,
            "n_processes": self.config.orbit_processes,
            "problem_construction_time": construction_finished - construction_started,
            "backend_setup_time": setup_finished - setup_started,
            "solver_execution_time": execution_finished - execution_started,
            "sample_extraction_time": extraction_finished - extraction_started,
        })
