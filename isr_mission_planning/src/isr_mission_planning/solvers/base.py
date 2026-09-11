from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from ..models import MissionScenario, SolverResult


@dataclass(frozen=True)
class SolverConfig:
    seed: int = 42
    timeout_seconds: float | None = None
    random_restarts: int = 20
    enforce_deadlines: bool = False
    enforce_maximum_mission_duration: bool = False
    orbit_full_sweeps: int = 500
    orbit_beta_start: float = 0.5
    orbit_beta_end: float = 4.0
    orbit_beta_step_interval: int = 10
    orbit_replicas: int = 4
    orbit_processes: int = 1


class MissionSolver(Protocol):
    name: str

    def solve(self, scenario: MissionScenario, config: SolverConfig = SolverConfig()) -> SolverResult: ...
