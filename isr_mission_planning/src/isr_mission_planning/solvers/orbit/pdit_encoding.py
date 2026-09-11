"""Categorical (p-dit) assignment model: one variable per task over its eligible UAVs.

Derived from the same V2 operational objective used by ``encoding_v2.py`` (base
proximity, geographic route-merge, target workload), but with the exactly-one
p-bit penalty removed: the categorical domain itself guarantees exactly one UAV
per task, so ``E_assignment == 0`` here by construction rather than by penalty.

Reuses ``encoding_v2._component_matrices`` for the underlying coefficients so the
p-bit and p-dit models are provably derived from the same source objective, then
exposes an independent (matrix-free, dict-based) energy evaluator for auditing.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from ...models import MissionScenario
from ..orbit.encoding_v2 import GeographicV2Config, _component_matrices

# NOTE: this module must not import from `isr_mission_planning.benchmark` — that package already
# imports from `isr_mission_planning.solvers.orbit` (see `benchmark/runner.py`'s SOLVERS dict), so
# an import here in the other direction would create a circular import that only "works" by
# accident of which module happens to be imported first. The exact-MILP solver and the
# cross-representation energy comparison (both of which need `benchmark`-side helpers) live in
# `benchmark/pdit_ground_state.py` instead, matching where `solve_qubo_exact` already lives.


@dataclass(frozen=True)
class CategoricalAssignmentModel:
    formulation: str
    variable_order: tuple[str, ...]
    task_states: dict[str, tuple[str, ...]]
    unary: dict[str, float]
    pairwise: dict[tuple[str, str], float]
    constant: float = 0.0
    metadata: dict[str, Any] = field(default_factory=dict)

    def cardinality_table(self) -> list[dict[str, Any]]:
        return [{"task_id": task, "eligible_uavs": uavs, "cardinality": len(uavs)}
                for task, uavs in self.task_states.items()]


def _variable_name(uav_id: str, task_id: str) -> str:
    return f"assign::{uav_id}::{task_id}"


def build_categorical_v2_model(scenario: MissionScenario, config: GeographicV2Config = GeographicV2Config()) -> CategoricalAssignmentModel:
    template, components, normalisation = _component_matrices(scenario, config)
    order = template.variable_order
    index = {name: position for position, name in enumerate(order)}

    unary_matrix = components["base_proximity"] + components["workload_balance"]
    pairwise_matrix = components["geographic_cluster"] + components["workload_balance"]

    unary = {name: float(unary_matrix[index[name], index[name]]) for name in order}
    pairwise: dict[tuple[str, str], float] = {}
    n = len(order)
    for i in range(n):
        for j in range(i + 1, n):
            value = float(pairwise_matrix[i, j])
            if value != 0.0:
                key = tuple(sorted((order[i], order[j])))
                pairwise[key] = value

    task_states: dict[str, list[str]] = {}
    for variable in template.variables:
        task_states.setdefault(variable.meaning["task_id"], []).append(variable.meaning["uav_id"])

    metadata = {
        "formulation_name": "assignment_categorical_pdit_v1",
        "derived_from": config.formulation_name,
        "weights": config.to_dict(),
        "normalisation": normalisation,
        "assignment_penalty": None,
        "pdit_groups": len(task_states),
        "unary_terms": len(unary),
        "pairwise_terms": len(pairwise),
        "energy_convention": "E(z) = sum_t U_t(z_t) + sum_{t<u} V_tu(z_t, z_u); "
                             "no exactly-one penalty term (guaranteed by the categorical domain)",
    }
    return CategoricalAssignmentModel(
        "assignment_categorical_pdit_v1", order,
        {task: tuple(uavs) for task, uavs in task_states.items()}, unary, pairwise, 0.0, metadata,
    )


def compute_pdit_energy(assignment: dict[str, str], model: CategoricalAssignmentModel) -> float:
    """Independent (matrix-free) categorical energy evaluator; never delegates to the QUBO auditor."""
    total = model.constant
    for task, uav in assignment.items():
        total += model.unary.get(_variable_name(uav, task), 0.0)
    tasks = list(assignment)
    for left_position, task_a in enumerate(tasks):
        uav_a = assignment[task_a]
        for task_b in tasks[left_position + 1:]:
            uav_b = assignment[task_b]
            if uav_a != uav_b:
                continue
            key = tuple(sorted((_variable_name(uav_a, task_a), _variable_name(uav_b, task_b))))
            total += model.pairwise.get(key, 0.0)
    return total


def assignment_to_one_hot(assignment: dict[str, str], model: CategoricalAssignmentModel) -> dict[str, int]:
    chosen = {_variable_name(uav, task) for task, uav in assignment.items()}
    return {name: int(name in chosen) for name in model.variable_order}


def one_hot_to_assignment(state, model: CategoricalAssignmentModel) -> dict[str, str]:
    values = dict(zip(model.variable_order, state, strict=True)) if not hasattr(state, "get") else state
    assignment: dict[str, str] = {}
    for task, uavs in model.task_states.items():
        active = [uav for uav in uavs if int(values.get(_variable_name(uav, task), 0)) == 1]
        if len(active) != 1:
            raise ValueError(f"Task {task} is not one-hot in the supplied state (active={active})")
        assignment[task] = active[0]
    return assignment


def decode_one_hot_with_repairs(state, model: CategoricalAssignmentModel) -> tuple[dict[str, str], int]:
    """Lenient variant of ``one_hot_to_assignment`` for raw sampler output.

    A minority of tasks have only one sensor-eligible UAV, so the installed ORBIT SDK (which
    requires a group of at least 2 states to register a genuine PDIT group; see
    ``pdit_backend.py``) enforces their assignment via an ordinary Lagrangian-penalty
    constraint rather than guaranteed-by-construction joint categorical sampling, and that
    constraint can rarely be violated by the stochastic sampler. This repairs such samples
    deterministically (lowest-unary-energy eligible UAV) and counts the repairs, mirroring the
    p-bit decoder's repair idiom, instead of crashing the reliability study on a rare sample.
    """
    values = dict(zip(model.variable_order, state, strict=True)) if not hasattr(state, "get") else state
    assignment: dict[str, str] = {}
    repairs = 0
    for task, uavs in model.task_states.items():
        active = [uav for uav in uavs if int(values.get(_variable_name(uav, task), 0)) == 1]
        if len(active) == 1:
            assignment[task] = active[0]
        else:
            repairs += 1
            assignment[task] = min(uavs, key=lambda uav: (model.unary.get(_variable_name(uav, task), 0.0), uav))
    return assignment, repairs
