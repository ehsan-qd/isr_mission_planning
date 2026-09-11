"""Backend-neutral intermediate representation for candidate ORBIT formulations."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Protocol

from ...geometry import travel_time
from ...models import MissionScenario, SensorType


@dataclass(frozen=True)
class DecisionVariable:
    name: str
    kind: str
    domain: tuple[int, ...]
    meaning: dict[str, str]


@dataclass(frozen=True)
class ConstraintSpec:
    name: str
    kind: str
    variables: tuple[str, ...]
    parameters: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class ObjectiveTerm:
    kind: str
    variables: tuple[str, ...]
    weight: float
    parameters: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class MissionEncoding:
    formulation: str
    variables: tuple[DecisionVariable, ...]
    constraints: tuple[ConstraintSpec, ...]
    objective_terms: tuple[ObjectiveTerm, ...]
    variable_order: tuple[str, ...] = ()
    qubo_matrix: tuple[tuple[float, ...], ...] = ()
    metadata: dict[str, Any] = field(default_factory=dict)


class EncodingStrategy(Protocol):
    def encode(self, scenario: MissionScenario) -> MissionEncoding: ...


class AssignmentSequencingEncoding:
    """Sparse IR only; it deliberately makes no claim about an ORBIT SDK format."""

    def encode(self, scenario: MissionScenario) -> MissionEncoding:
        variables: list[DecisionVariable] = []
        constraints: list[ConstraintSpec] = []
        workloads: dict[str, float] = {}
        for task in scenario.tasks:
            eligible_names = []
            for uav in scenario.uavs:
                if task.required_sensor in uav.sensors:
                    name = f"assign::{uav.id}::{task.id}"
                    eligible_names.append(name)
                    variables.append(DecisionVariable(name, "binary", (0, 1), {"uav_id": uav.id, "task_id": task.id}))
                    base = scenario.base(uav.home_base_id).location
                    workloads[name] = task.service_duration + 2.0 * travel_time(base, task.location, uav.speed)
            constraints.append(ConstraintSpec(f"exactly_one::{task.id}", "exactly_one", tuple(eligible_names)))
        order = tuple(variable.name for variable in variables)
        index = {name: position for position, name in enumerate(order)}
        size = len(order)
        qubo = [[0.0] * size for _ in range(size)]
        assignment_penalty = 8.0
        max_workload = max(workloads.values(), default=1.0)
        normalised = {name: value / max_workload for name, value in workloads.items()}
        # A(1-sum_i x_ij)^2 enforces exactly one eligible UAV for every task.
        for constraint in constraints:
            for name in constraint.variables:
                qubo[index[name]][index[name]] -= assignment_penalty
            for left_position, left in enumerate(constraint.variables):
                for right in constraint.variables[left_position + 1:]:
                    i, j = sorted((index[left], index[right]))
                    qubo[i][j] += 2.0 * assignment_penalty
        # Sum_i(load_i^2) is a quadratic makespan surrogate; a small linear term
        # prefers lower estimated base/task/base workload when assignment ties remain.
        for uav in scenario.uavs:
            names = [name for name in order if f"assign::{uav.id}::" in name]
            for left_position, left in enumerate(names):
                i, wi = index[left], normalised[left]
                qubo[i][i] += wi * wi + 0.02 * wi
                for right in names[left_position + 1:]:
                    j, wj = index[right], normalised[right]
                    qubo[min(i, j)][max(i, j)] += 2.0 * wi * wj
        return MissionEncoding(
            "assignment_sequencing_ir_v1", tuple(variables), tuple(constraints),
            (ObjectiveTerm("makespan_surrogate", tuple(v.name for v in variables if v.name.startswith("assign::")), 1.0),),
            order, tuple(tuple(row) for row in qubo),
            {
                "sensor_types": [sensor.value for sensor in SensorType],
                "formulation_name": "assignment_v1",
                "formulation_version": "1.0",
                "backend_format": "QUBO upper triangular",
                "energy_convention": "E(x) = x^T Q x; off-diagonal coefficients occur once",
                "constant_offset": 0.0,
                "qubo_components": [
                    {
                        "name": "Exactly-one assignment",
                        "purpose": "One eligible UAV per task (constant-shifted squared penalty)",
                        "weight": assignment_penalty,
                    },
                    {
                        "name": "Per-UAV squared estimated load",
                        "purpose": "Makespan surrogate using service plus base/task/base travel",
                        "weight": 1.0,
                    },
                    {
                        "name": "Linear estimated workload",
                        "purpose": "Tie-break toward lower estimated assignment workload",
                        "weight": 0.02,
                    },
                    {
                        "name": "Sensor compatibility",
                        "purpose": "Unsupported UAV/task variables are omitted",
                        "weight": None,
                    },
                ],
            },
        )


# Stable name used by formulation-comparison tooling. The original class name
# remains for backward compatibility and its implementation is the V1 reference.
AssignmentV1Encoding = AssignmentSequencingEncoding
