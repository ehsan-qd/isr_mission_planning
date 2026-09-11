"""Deterministic structured synthetic mission generation."""

from __future__ import annotations

import random
from pathlib import Path

from ..models import BaseStation, MissionScenario, MissionTask, OperatingArea, SensorType, UAV, Waypoint
from .presets import GenerationPreset, get_preset


def _bounded_gaussian(rng: random.Random, centre: float, sigma: float, upper: float) -> float:
    return round(min(upper, max(0.0, rng.gauss(centre, sigma))), 3)


def generate_scenario(
    scale: str = "small", seed: int = 42, *, ensure_feasible: bool = True,
    preset: GenerationPreset | None = None,
) -> MissionScenario:
    preset = preset or get_preset(scale)
    rng = random.Random(seed)
    width, height = preset.area_width, preset.area_height

    # Bases on opposing sides encourage intersecting routes without guaranteeing conflicts.
    bases = tuple(
        BaseStation(
            id=f"BASE_{index + 1}",
            location=Waypoint(
                round(width * (0.08 if index % 2 == 0 else 0.92), 3),
                round(height * (index + 1) / (preset.number_of_bases + 1), 3),
                f"Base {index + 1}",
            ),
        )
        for index in range(preset.number_of_bases)
    )

    sensors = list(SensorType)
    uavs: list[UAV] = []
    for index in range(preset.number_of_uavs):
        # First three aircraft guarantee coverage. Later payloads are heterogeneous and SAR-scarce.
        payload = {sensors[index % len(sensors)]} if index < 3 else {SensorType.EO if rng.random() < 0.55 else rng.choice(sensors)}
        if rng.random() < 0.35:
            payload.add(rng.choice(sensors))
        uavs.append(UAV(
            id=f"UAV_{index + 1:02d}", home_base_id=bases[index % len(bases)].id,
            speed=round(rng.uniform(18.0, 32.0), 3), sensors=tuple(sorted(payload, key=lambda item: item.value)),
            maximum_mission_duration=None,
        ))

    cluster_centres = [
        (rng.uniform(width * 0.2, width * 0.8), rng.uniform(height * 0.15, height * 0.85))
        for _ in range(preset.clusters)
    ]
    priority_cluster = rng.randrange(preset.clusters)
    tasks: list[MissionTask] = []
    for index in range(preset.number_of_tasks):
        clustered = rng.random() < 0.78
        cluster_index = rng.randrange(preset.clusters)
        if clustered:
            cx, cy = cluster_centres[cluster_index]
            x = _bounded_gaussian(rng, cx, width * 0.055, width)
            y = _bounded_gaussian(rng, cy, height * 0.055, height)
        else:
            x, y = round(rng.uniform(0, width), 3), round(rng.uniform(0, height), 3)
        sensor = rng.choices(sensors, weights=(0.5, 0.35, 0.15), k=1)[0]
        priority = rng.randint(7, 10) if cluster_index == priority_cluster and clustered else rng.randint(1, 8)
        tasks.append(MissionTask(
            id=f"TASK_{index + 1:03d}", location=Waypoint(x, y, f"Task {index + 1}"),
            required_sensor=sensor, service_duration=round(rng.uniform(1.0, 8.0), 3), priority=float(priority),
        ))

    if ensure_feasible:
        carried = {sensor for uav in uavs for sensor in uav.sensors}
        missing = {task.required_sensor for task in tasks} - carried
        for sensor in missing:
            first = uavs[0]
            uavs[0] = UAV(first.id, first.home_base_id, first.speed,
                          tuple(sorted(set(first.sensors) | {sensor}, key=lambda item: item.value)), first.maximum_mission_duration)

    return MissionScenario(
        scenario_id=f"{preset.scale}_seed_{seed}", operating_area=OperatingArea(width, height),
        bases=bases, uavs=tuple(uavs), tasks=tuple(tasks), minimum_separation=preset.minimum_separation,
        metadata={"scale": preset.scale, "seed": seed, "generator": "structured-v1", "ensure_feasible": ensure_feasible},
    )


def generate_and_save(scale: str, seed: int, output: str | Path | None = None) -> Path:
    scenario = generate_scenario(scale, seed)
    target = Path(output) if output else Path("data/scenarios") / scale / f"{scale}_seed_{seed}.json"
    scenario.to_json(target)
    return target
