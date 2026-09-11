from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Any

from .common import JsonModel


class SensorType(str, Enum):
    EO = "EO"
    IR = "IR"
    SAR = "SAR"


@dataclass(frozen=True)
class Waypoint(JsonModel):
    x: float
    y: float
    label: str | None = None

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "Waypoint":
        return cls(x=float(data["x"]), y=float(data["y"]), label=data.get("label"))


@dataclass(frozen=True)
class BaseStation(JsonModel):
    id: str
    location: Waypoint

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "BaseStation":
        return cls(id=data["id"], location=Waypoint.from_dict(data["location"]))


@dataclass(frozen=True)
class UAV(JsonModel):
    id: str
    home_base_id: str
    speed: float
    sensors: tuple[SensorType, ...]
    maximum_mission_duration: float | None = None

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "UAV":
        return cls(
            id=data["id"], home_base_id=data["home_base_id"], speed=float(data["speed"]),
            sensors=tuple(SensorType(item) for item in data["sensors"]),
            maximum_mission_duration=data.get("maximum_mission_duration"),
        )
