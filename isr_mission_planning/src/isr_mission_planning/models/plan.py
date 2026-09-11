from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from .assets import Waypoint
from .common import JsonModel


@dataclass(frozen=True)
class TaskAssignment(JsonModel):
    task_id: str
    uav_id: str

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "TaskAssignment":
        return cls(**data)


@dataclass(frozen=True)
class ScheduledTask(JsonModel):
    task_id: str
    start_time: float
    finish_time: float

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "ScheduledTask":
        return cls(task_id=data["task_id"], start_time=float(data["start_time"]), finish_time=float(data["finish_time"]))


@dataclass(frozen=True)
class TrajectorySegment(JsonModel):
    uav_id: str
    start: Waypoint
    end: Waypoint
    start_time: float
    end_time: float
    kind: str = "travel"
    from_id: str | None = None
    to_id: str | None = None

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "TrajectorySegment":
        return cls(
            uav_id=data["uav_id"], start=Waypoint.from_dict(data["start"]), end=Waypoint.from_dict(data["end"]),
            start_time=float(data["start_time"]), end_time=float(data["end_time"]), kind=data.get("kind", "travel"),
            from_id=data.get("from_id"), to_id=data.get("to_id"),
        )


@dataclass(frozen=True)
class UAVRoute(JsonModel):
    uav_id: str
    scheduled_tasks: tuple[ScheduledTask, ...]
    trajectory_segments: tuple[TrajectorySegment, ...]
    return_time: float

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "UAVRoute":
        return cls(
            uav_id=data["uav_id"], scheduled_tasks=tuple(ScheduledTask.from_dict(x) for x in data["scheduled_tasks"]),
            trajectory_segments=tuple(TrajectorySegment.from_dict(x) for x in data["trajectory_segments"]),
            return_time=float(data["return_time"]),
        )


@dataclass(frozen=True)
class MissionPlan(JsonModel):
    scenario_id: str
    solver_name: str
    uav_routes: tuple[UAVRoute, ...]
    task_assignments: tuple[TaskAssignment, ...]
    mission_start_time: float
    mission_end_time: float
    objective_value: float
    metadata: dict[str, Any] = field(default_factory=dict)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "MissionPlan":
        return cls(
            scenario_id=data["scenario_id"], solver_name=data["solver_name"],
            uav_routes=tuple(UAVRoute.from_dict(x) for x in data["uav_routes"]),
            task_assignments=tuple(TaskAssignment.from_dict(x) for x in data["task_assignments"]),
            mission_start_time=float(data["mission_start_time"]), mission_end_time=float(data["mission_end_time"]),
            objective_value=float(data["objective_value"]), metadata=data.get("metadata", {}),
        )
