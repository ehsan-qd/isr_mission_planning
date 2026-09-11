from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from .assets import SensorType, Waypoint
from .common import JsonModel


@dataclass(frozen=True)
class MissionTask(JsonModel):
    id: str
    location: Waypoint
    required_sensor: SensorType
    service_duration: float
    priority: float
    earliest_start: float | None = None
    deadline: float | None = None

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "MissionTask":
        return cls(
            id=data["id"], location=Waypoint.from_dict(data["location"]),
            required_sensor=SensorType(data["required_sensor"]),
            service_duration=float(data["service_duration"]), priority=float(data["priority"]),
            earliest_start=data.get("earliest_start"), deadline=data.get("deadline"),
        )
