from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
import time
from typing import Any, Protocol

from ..base import SolverConfig
from .encoding import MissionEncoding


class OrbitExecutionMode(str, Enum):
    SIMULATOR = "simulator"
    HARDWARE = "hardware"


@dataclass(frozen=True)
class BackendResponse:
    samples: tuple[dict[str, int], ...]
    metadata: dict[str, Any]


class OrbitBackend(Protocol):
    mode: OrbitExecutionMode

    def optimise(self, encoding: MissionEncoding) -> BackendResponse: ...


class UnconfiguredOrbitBackend:
    def __init__(self, mode: OrbitExecutionMode = OrbitExecutionMode.SIMULATOR):
        self.mode = mode

    def optimise(self, encoding: MissionEncoding) -> BackendResponse:
        raise NotImplementedError(
            f"ORBIT {self.mode.value} backend is not configured; no SDK or hardware behaviour is assumed"
        )


class OrbitSdkSimulatorBackend:
    """Adapter around the documented local ORBIT SDK simulator API."""

    mode = OrbitExecutionMode.SIMULATOR

    def __init__(self, config: SolverConfig):
        self.config = config

    def optimise(self, encoding: MissionEncoding) -> BackendResponse:
        if not encoding.qubo_matrix or not encoding.variable_order:
            raise ValueError("The selected encoding does not contain a QUBO matrix")
        try:
            import numpy as np
            from orbit_sdk.models import AdvancedSolverParams, SolverParams
            from orbit_sdk.problems import QuboProblem
            from orbit_sdk.solvers import SimulatorSolver
        except ImportError as exc:
            raise NotImplementedError(
                "Install the optional ORBIT SDK and simulator; see README.md, ORBIT setup."
            ) from exc

        construction_started = time.perf_counter()
        problem = QuboProblem(Q=np.asarray(encoding.qubo_matrix, dtype=float))
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
        samples = tuple(
            {name: int(value) for name, value in zip(encoding.variable_order, state, strict=True)}
            for state in sdk_result.samples
        )
        best = {name: int(value) for name, value in zip(encoding.variable_order, sdk_result.min_state, strict=True)}
        extraction_finished = time.perf_counter()
        return BackendResponse(samples, {
            "best_sample": best,
            "minimum_qubo_energy": float(sdk_result.min_energy),
            "number_of_samples": int(sdk_result.samples.shape[0]),
            "number_of_pbits": int(sdk_result.n_pbits),
            "sdk_backend": "SimulatorSolver",
            "requested_seed": self.config.seed,
            "seed_applied": False,
            "seed_note": "orbit-sdk 0.0.2 does not expose simulator random_seed through SolverParams",
            "full_sweeps": self.config.orbit_full_sweeps,
            "beta_start": self.config.orbit_beta_start,
            "beta_end": self.config.orbit_beta_end,
            "beta_step_interval": self.config.orbit_beta_step_interval,
            "n_replicas": self.config.orbit_replicas,
            "n_processes": self.config.orbit_processes,
            "timeout_seconds": self.config.timeout_seconds or 300.0,
            "problem_construction_time": construction_finished - construction_started,
            "backend_setup_time": setup_finished - setup_started,
            "solver_execution_time": execution_finished - execution_started,
            "sample_extraction_time": extraction_finished - extraction_started,
        })
