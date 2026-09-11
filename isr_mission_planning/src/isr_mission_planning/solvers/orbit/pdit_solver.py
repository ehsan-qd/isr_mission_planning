"""``orbit_pdit``: solves the categorical (p-dit) assignment model natively via ORBIT's MIQP path."""

from __future__ import annotations

import time

from ...models import MissionScenario, SolverResult, SolverStatus
from ..base import SolverConfig
from .decoder import decode_assignment_state
from .encoding import AssignmentV1Encoding
from .encoding_v2 import GeographicV2Config
from .pdit_backend import OrbitPditSimulatorBackend
from .pdit_encoding import build_categorical_v2_model, compute_pdit_energy, decode_one_hot_with_repairs

DEFAULT_V2_CONFIG = GeographicV2Config(assignment_penalty=12.0, base_weight=0.75, cluster_weight=0.25, workload_weight=1.5)


class OrbitPditSolver:
    """Native categorical-variable ORBIT solver: one p-dit per task, no exactly-one penalty."""

    name = "orbit_pdit"

    def __init__(self, backend=None, v2_config: GeographicV2Config = DEFAULT_V2_CONFIG):
        self.backend = backend
        self.v2_config = v2_config

    def solve(self, scenario: MissionScenario, config: SolverConfig = SolverConfig()) -> SolverResult:
        started = time.perf_counter()
        model = build_categorical_v2_model(scenario, self.v2_config)
        encoded = time.perf_counter()
        backend = self.backend or OrbitPditSimulatorBackend(config)
        try:
            response = backend.optimise(model)
            sampled = time.perf_counter()
            best_state = response.metadata.get("best_sample", response.samples[0])
            assignment, single_option_repairs = decode_one_hot_with_repairs(best_state, model)
            raw_energy = compute_pdit_energy(assignment, model)
            v1_encoding = AssignmentV1Encoding().encode(scenario)
            plan = decode_assignment_state(scenario, v1_encoding, best_state,
                                           source_name="ORBIT p-dit simulator", source_metadata=response.metadata)
            finished = time.perf_counter()
            metadata = {
                "execution_mode": backend.mode.value, "encoding_time": encoded - started,
                "orbit_execution_time": sampled - encoded, "decoding_time": finished - sampled,
                "raw_pdit_energy": raw_energy, "raw_pdit_assignment": assignment,
                "single_option_task_repairs": single_option_repairs,
                "representation": "categorical_pdit", "logical_variables": len(model.task_states),
                "ground_state_claim": False,
                **response.metadata,
            }
            return SolverResult(SolverStatus.FEASIBLE, plan, plan.objective_value, finished - started, metadata)
        except NotImplementedError as exc:
            return SolverResult(SolverStatus.UNSUPPORTED, None, None, time.perf_counter() - started, {
                "execution_mode": backend.mode.value, "encoding_time": encoded - started, "reason": str(exc),
            })
