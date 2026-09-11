from __future__ import annotations

from ...geometry import travel_time
from ...models import MissionPlan, MissionScenario
from ..scheduling import build_plan_from_sequences
from .backend import BackendResponse
from .encoding import MissionEncoding


def decode_response(scenario: MissionScenario, encoding: MissionEncoding, response: BackendResponse) -> MissionPlan:
    if not response.samples:
        raise ValueError("ORBIT returned no samples")
    state = response.metadata.get("best_sample", response.samples[0])
    return decode_assignment_state(scenario, encoding, state, source_name="ORBIT simulator", source_metadata=response.metadata)


def decode_assignment_state(scenario: MissionScenario, encoding: MissionEncoding, state, *,
                            source_name: str, source_metadata: dict | None = None) -> MissionPlan:
    if not hasattr(state, "get"):
        state = dict(zip(encoding.variable_order, state, strict=True))
    assigned: dict[str, list[str]] = {uav.id: [] for uav in scenario.uavs}
    repair_count = 0
    estimated_load = {uav.id: 0.0 for uav in scenario.uavs}
    for task in scenario.tasks:
        eligible = [uav for uav in scenario.uavs if task.required_sensor in uav.sensors]
        active = [uav for uav in eligible if state.get(f"assign::{uav.id}::{task.id}", 0) == 1]
        if len(active) != 1:
            repair_count += 1
            active = [min(eligible, key=lambda uav: (estimated_load[uav.id], uav.id))]
        chosen = active[0]
        assigned[chosen.id].append(task.id)
        base = scenario.base(chosen.home_base_id).location
        estimated_load[chosen.id] += task.service_duration + 2.0 * travel_time(base, task.location, chosen.speed)

    # Layer B is deliberately classical and deterministic in this first hybrid:
    # nearest-neighbour sequencing converts ORBIT's assignment into routes.
    sequences: dict[str, list[str]] = {}
    for uav in scenario.uavs:
        remaining = set(assigned[uav.id])
        location = scenario.base(uav.home_base_id).location
        sequence: list[str] = []
        while remaining:
            task_id = min(remaining, key=lambda item: (travel_time(location, scenario.task(item).location, uav.speed), item))
            sequence.append(task_id)
            location = scenario.task(task_id).location
            remaining.remove(task_id)
        sequences[uav.id] = sequence
    metadata = dict(source_metadata or {})
    metadata.update({
        "assignment_backend": source_name,
        "sequencing_backend": "deterministic nearest neighbour",
        "assignment_repairs": repair_count,
        "hardware_execution": source_name == "ORBIT hardware",
    })
    solver_name = source_name.lower().replace(" ", "_") + "_hybrid"
    return build_plan_from_sequences(scenario, sequences, solver_name, metadata)
