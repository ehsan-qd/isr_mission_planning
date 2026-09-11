from __future__ import annotations

import time

from ...models import MissionScenario, SolverResult, SolverStatus
from ..base import SolverConfig
from .backend import OrbitBackend, OrbitSdkSimulatorBackend
from .decoder import decode_response
from .encoding import AssignmentSequencingEncoding, EncodingStrategy


class OrbitSolver:
    name = "orbit"

    def __init__(self, backend: OrbitBackend | None = None, encoder: EncodingStrategy | None = None):
        self.backend = backend
        self.encoder = encoder or AssignmentSequencingEncoding()

    def solve(self, scenario: MissionScenario, config: SolverConfig = SolverConfig()) -> SolverResult:
        started = time.perf_counter()
        encoding = self.encoder.encode(scenario)
        encoded = time.perf_counter()
        backend = self.backend or OrbitSdkSimulatorBackend(config)
        try:
            response = backend.optimise(encoding)
            solved = time.perf_counter()
            plan = decode_response(scenario, encoding, response)
            finished = time.perf_counter()
            return SolverResult(SolverStatus.FEASIBLE, plan, plan.objective_value, finished - started, {
                "execution_mode": backend.mode.value, "encoding_time": encoded - started,
                "solver_time": solved - encoded, "decoding_time": finished - solved,
                **response.metadata,
            })
        except NotImplementedError as exc:
            return SolverResult(SolverStatus.UNSUPPORTED, None, None, time.perf_counter() - started, {
                "execution_mode": backend.mode.value, "encoding_time": encoded - started, "reason": str(exc),
            })
