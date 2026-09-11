from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any

from .common import JsonModel
from .plan import MissionPlan, TrajectorySegment


class SolverStatus(str, Enum):
    OPTIMAL = "OPTIMAL"
    FEASIBLE = "FEASIBLE"
    INFEASIBLE = "INFEASIBLE"
    TIMEOUT = "TIMEOUT"
    ERROR = "ERROR"
    UNSUPPORTED = "UNSUPPORTED"


@dataclass(frozen=True)
class ConflictEvent(JsonModel):
    uav_a: str
    uav_b: str
    time_of_closest_approach: float
    minimum_separation: float
    segment_a: TrajectorySegment
    segment_b: TrajectorySegment
    severity: str


@dataclass(frozen=True)
class MissionMetrics(JsonModel):
    makespan: float
    total_travel_distance: float
    total_flight_time: float
    uav_utilisation: dict[str, float]
    task_completion_times: dict[str, float]
    number_of_conflicts: int = 0
    minimum_separation: float | None = None


@dataclass(frozen=True)
class ValidationIssue(JsonModel):
    code: str
    message: str
    severity: str = "error"


@dataclass(frozen=True)
class ValidationReport(JsonModel):
    feasible: bool
    issues: tuple[ValidationIssue, ...]
    metrics: MissionMetrics
    conflicts: tuple[ConflictEvent, ...]


@dataclass(frozen=True)
class SolverResult(JsonModel):
    status: SolverStatus
    mission_plan: MissionPlan | None
    objective_value: float | None
    runtime_seconds: float
    solver_metadata: dict[str, Any] = field(default_factory=dict)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "SolverResult":
        return cls(status=SolverStatus(data["status"]), mission_plan=MissionPlan.from_dict(data["mission_plan"]) if data.get("mission_plan") else None,
                   objective_value=data.get("objective_value"), runtime_seconds=float(data["runtime_seconds"]), solver_metadata=data.get("solver_metadata", {}))


@dataclass(frozen=True)
class BenchmarkResult(JsonModel):
    scenario: str
    scale: str
    number_of_tasks: int
    number_of_uavs: int
    solver: str
    status: str
    objective_value: float | None
    makespan: float | None
    total_distance: float | None
    total_flight_time: float | None
    runtime_seconds: float
    feasible: bool
    number_of_conflicts: int
    minimum_separation: float | None
    timing: dict[str, float] = field(default_factory=dict)
