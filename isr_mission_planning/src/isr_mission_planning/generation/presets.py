from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class GenerationPreset:
    scale: str
    number_of_uavs: int
    number_of_tasks: int
    number_of_bases: int
    area_width: float
    area_height: float
    clusters: int
    minimum_separation: float


PRESETS = {
    "small": GenerationPreset("small", 5, 16, 2, 100.0, 100.0, 3, 2.0),
    "medium": GenerationPreset("medium", 15, 75, 3, 250.0, 250.0, 6, 3.0),
    "large": GenerationPreset("large", 40, 300, 6, 600.0, 600.0, 12, 5.0),
}


def get_preset(scale: str) -> GenerationPreset:
    try:
        return PRESETS[scale.lower()]
    except KeyError as exc:
        raise ValueError(f"Unknown scale {scale!r}; choose from {', '.join(PRESETS)}") from exc
