from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from .assets import BaseStation, UAV
from .common import JsonModel
from .tasks import MissionTask


@dataclass(frozen=True)
class OperatingArea(JsonModel):
    width: float
    height: float

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "OperatingArea":
        return cls(width=float(data["width"]), height=float(data["height"]))


@dataclass(frozen=True)
class MissionScenario(JsonModel):
    scenario_id: str
    operating_area: OperatingArea
    bases: tuple[BaseStation, ...]
    uavs: tuple[UAV, ...]
    tasks: tuple[MissionTask, ...]
    minimum_separation: float = 1.0
    metadata: dict[str, Any] = field(default_factory=dict)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "MissionScenario":
        return cls(
            scenario_id=data["scenario_id"], operating_area=OperatingArea.from_dict(data["operating_area"]),
            bases=tuple(BaseStation.from_dict(item) for item in data["bases"]),
            uavs=tuple(UAV.from_dict(item) for item in data["uavs"]),
            tasks=tuple(MissionTask.from_dict(item) for item in data["tasks"]),
            minimum_separation=float(data.get("minimum_separation", 1.0)), metadata=data.get("metadata", {}),
        )

    def base(self, base_id: str) -> BaseStation:
        return next(item for item in self.bases if item.id == base_id)

    def uav(self, uav_id: str) -> UAV:
        return next(item for item in self.uavs if item.id == uav_id)

    def task(self, task_id: str) -> MissionTask:
        return next(item for item in self.tasks if item.id == task_id)
