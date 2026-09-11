"""Geography-aware assignment QUBO (V2), kept separate from immutable V1."""

from __future__ import annotations

import math
from dataclasses import asdict, dataclass

import numpy as np

from ...geometry import euclidean_distance, travel_time
from ...models import MissionScenario
from .encoding import AssignmentV1Encoding, MissionEncoding, ObjectiveTerm


@dataclass(frozen=True)
class GeographicV2Config:
    assignment_penalty: float = 8.0
    base_weight: float = 0.5
    cluster_weight: float = 1.0
    workload_weight: float = 1.0
    travel_burden_factor: float = 1.0
    cluster_distance_cap: float = 1.0
    formulation_name: str = "assignment_geographic_v2"
    formulation_version: str = "2.1"

    def to_dict(self) -> dict:
        return asdict(self)


def _component_matrices(scenario: MissionScenario, config: GeographicV2Config):
    template = AssignmentV1Encoding().encode(scenario)
    order, n = template.variable_order, len(template.variable_order)
    index = {name: position for position, name in enumerate(order)}
    components = {name: np.zeros((n, n), dtype=float) for name in ("feasibility", "base_proximity", "geographic_cluster", "workload_balance")}

    # Constant-shifted exactly-one penalty: A[(sum x - 1)^2 - 1].
    for constraint in template.constraints:
        for name in constraint.variables:
            components["feasibility"][index[name], index[name]] -= config.assignment_penalty
        for left_pos, left in enumerate(constraint.variables):
            for right in constraint.variables[left_pos + 1:]:
                i, j = sorted((index[left], index[right]))
                components["feasibility"][i, j] += 2.0 * config.assignment_penalty

    diameter = max(math.hypot(scenario.operating_area.width, scenario.operating_area.height), 1e-12)
    slowest_speed = min(uav.speed for uav in scenario.uavs)
    time_scale = diameter / slowest_speed
    max_service = max(task.service_duration for task in scenario.tasks)
    burdens: dict[str, float] = {}
    for variable in template.variables:
        uav, task = scenario.uav(variable.meaning["uav_id"]), scenario.task(variable.meaning["task_id"])
        base = scenario.base(uav.home_base_id).location
        base_time = travel_time(base, task.location, uav.speed) / time_scale
        components["base_proximity"][index[variable.name], index[variable.name]] += config.base_weight * base_time
        burdens[variable.name] = task.service_duration / max_service + config.travel_burden_factor * base_time

    # Pairwise dispersion penalty.  The previous formulation subtracted duplicated
    # base legs, creating a negative reward for every co-assigned task pair.  That
    # reward grew quadratically with task count even though a route uses only k-1
    # task-to-task edges, and could therefore collapse many tasks onto one fast UAV.
    # Keeping this term non-negative retains a preference for compact assignments
    # without manufacturing route savings that have not yet been sequenced.
    for uav in scenario.uavs:
        eligible = [task for task in scenario.tasks if task.required_sensor in uav.sensors]
        for left_pos, left_task in enumerate(eligible):
            for right_task in eligible[left_pos + 1:]:
                left = f"assign::{uav.id}::{left_task.id}"
                right = f"assign::{uav.id}::{right_task.id}"
                pair_time = euclidean_distance(left_task.location, right_task.location) / uav.speed / time_scale
                i, j = sorted((index[left], index[right]))
                components["geographic_cluster"][i, j] += config.cluster_weight * min(
                    pair_time, config.cluster_distance_cap,
                )

    # Target-workload penalty using service plus normalised base travel burden.
    minimum_burdens = []
    for task in scenario.tasks:
        candidates = [burdens[f"assign::{uav.id}::{task.id}"] for uav in scenario.uavs if f"assign::{uav.id}::{task.id}" in burdens]
        minimum_burdens.append(min(candidates))
    target = sum(minimum_burdens) / len(scenario.uavs)
    workload_scale = max(target, 1.0)
    for uav in scenario.uavs:
        names = [name for name in order if name.startswith(f"assign::{uav.id}::")]
        for left_pos, left in enumerate(names):
            i, burden = index[left], burdens[left] / workload_scale
            components["workload_balance"][i, i] += config.workload_weight * (burden * burden - 2.0 * burden)
            for right in names[left_pos + 1:]:
                j, other = index[right], burdens[right] / workload_scale
                components["workload_balance"][min(i, j), max(i, j)] += config.workload_weight * 2.0 * burden * other
    normalisation = {"distance": "operating-area diameter", "travel_time": "diameter / slowest UAV speed",
                     "service_duration": "maximum task duration", "workload": "estimated target workload"}
    return template, components, normalisation


class GeographicAssignmentV2Encoding:
    def __init__(self, config: GeographicV2Config = GeographicV2Config()):
        self.config = config

    def encode(self, scenario: MissionScenario) -> MissionEncoding:
        template, components, normalisation = _component_matrices(scenario, self.config)
        matrix = sum(components.values(), start=np.zeros_like(next(iter(components.values()))))
        metadata = {
            "formulation_name": self.config.formulation_name, "formulation_version": self.config.formulation_version,
            "backend_format": "QUBO upper triangular", "energy_convention": "E(x) = x^T Q x; off-diagonal coefficients occur once",
            "constant_offset": 0.0, "weights": self.config.to_dict(), "normalisation": normalisation,
            "qubo_components": [
                {"name": "Exactly-one assignment", "purpose": "Hard task assignment feasibility", "weight": self.config.assignment_penalty},
                {"name": "Base proximity", "purpose": "Speed-aware base-to-task travel", "weight": self.config.base_weight},
                {"name": "Geographic dispersion", "purpose": "Bounded speed-aware distance between co-assigned tasks", "weight": self.config.cluster_weight},
                {"name": "Target workload", "purpose": "Balance service and estimated travel burden", "weight": self.config.workload_weight},
            ],
        }
        return MissionEncoding(self.config.formulation_name, template.variables, template.constraints,
                               tuple(ObjectiveTerm(name, template.variable_order, 1.0) for name in components),
                               template.variable_order, tuple(tuple(float(value) for value in row) for row in matrix), metadata)


def decompose_v2_energy(state, scenario: MissionScenario, config: GeographicV2Config) -> dict[str, float]:
    template, components, _ = _component_matrices(scenario, config)
    vector = np.asarray(state, dtype=float)
    values = {name: float(vector @ matrix @ vector) for name, matrix in components.items()}
    values["total"] = sum(values.values())
    encoded = GeographicAssignmentV2Encoding(config).encode(scenario)
    if abs(values["total"] - float(vector @ np.asarray(encoded.qubo_matrix) @ vector)) > 1e-8:
        raise RuntimeError("V2 component energies do not sum to total QUBO energy")
    return values
