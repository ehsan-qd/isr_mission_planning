"""Transparent ORBIT assignment sampling followed by deterministic QUBO refinement."""

from __future__ import annotations

import time
from dataclasses import replace

import numpy as np

from ...geometry import travel_time
from ...models import MissionScenario, SolverResult, SolverStatus
from ..greedy import GreedySolver
from ..base import SolverConfig
from .backend import OrbitBackend, OrbitSdkSimulatorBackend
from .decoder import decode_assignment_state
from .encoding_v2 import GeographicAssignmentV2Encoding, GeographicV2Config


def _energy(state, matrix) -> float:
    vector = np.asarray(state, dtype=float)
    return float(vector @ matrix @ vector)


def _mapping(state, encoding):
    return {variable.meaning["task_id"]: variable.meaning["uav_id"]
            for bit, variable in zip(state, encoding.variables, strict=True) if bit}


def _state(mapping, encoding):
    return tuple(int(mapping[var.meaning["task_id"]] == var.meaning["uav_id"]) for var in encoding.variables)


def _neighbours(state, scenario, encoding):
    mapping = _mapping(state, encoding)
    if len(mapping) != len(scenario.tasks):
        return
    for task in scenario.tasks:
        current = mapping[task.id]
        for uav in scenario.uavs:
            if uav.id != current and task.required_sensor in uav.sensors:
                changed = dict(mapping); changed[task.id] = uav.id; yield _state(changed, encoding)
    for left_pos, left in enumerate(scenario.tasks):
        for right in scenario.tasks[left_pos + 1:]:
            left_uav, right_uav = mapping[left.id], mapping[right.id]
            if left_uav != right_uav and left.required_sensor in scenario.uav(right_uav).sensors and right.required_sensor in scenario.uav(left_uav).sensors:
                changed = dict(mapping); changed[left.id], changed[right.id] = right_uav, left_uav; yield _state(changed, encoding)


def refine_assignment_state(scenario, encoding, initial_state):
    """Steepest feasible QUBO descent using exact sparse flip deltas.

    A neighbour changes only two assignment bits for a move or four for a swap.
    Evaluating those deltas directly avoids materialising thousands of full states
    and repeating dense matrix products, which is essential for large instances.
    """
    matrix = np.asarray(encoding.qubo_matrix, dtype=float)
    vector = np.asarray(tuple(initial_state), dtype=float)
    mapping = _mapping(vector, encoding)
    if len(mapping) != len(scenario.tasks):
        return tuple(int(value) for value in vector), _energy(vector, matrix), 0

    variable_index = {
        (variable.meaning["task_id"], variable.meaning["uav_id"]): index
        for index, variable in enumerate(encoding.variables)
    }
    symmetric = matrix + matrix.T
    gradient = symmetric @ vector
    energy = _energy(vector, matrix)
    moves = 0

    def delta_for(changes):
        linear = sum(change * gradient[index] for index, change in changes)
        quadratic = sum(
            left_change * matrix[left_index, right_index] * right_change
            for left_index, left_change in changes
            for right_index, right_change in changes
        )
        return float(linear + quadratic)

    while True:
        best = None
        for task in scenario.tasks:
            current = mapping[task.id]
            current_index = variable_index[(task.id, current)]
            for uav in scenario.uavs:
                if uav.id == current or task.required_sensor not in uav.sensors:
                    continue
                changes = ((current_index, -1.0), (variable_index[(task.id, uav.id)], 1.0))
                candidate = (delta_for(changes), changes, ((task.id, uav.id),))
                if best is None or (candidate[0], candidate[1]) < (best[0], best[1]):
                    best = candidate

        for left_pos, left in enumerate(scenario.tasks):
            for right in scenario.tasks[left_pos + 1:]:
                left_uav, right_uav = mapping[left.id], mapping[right.id]
                if left_uav == right_uav:
                    continue
                if left.required_sensor not in scenario.uav(right_uav).sensors:
                    continue
                if right.required_sensor not in scenario.uav(left_uav).sensors:
                    continue
                changes = (
                    (variable_index[(left.id, left_uav)], -1.0),
                    (variable_index[(left.id, right_uav)], 1.0),
                    (variable_index[(right.id, right_uav)], -1.0),
                    (variable_index[(right.id, left_uav)], 1.0),
                )
                candidate = (
                    delta_for(changes), changes,
                    ((left.id, right_uav), (right.id, left_uav)),
                )
                if best is None or (candidate[0], candidate[1]) < (best[0], best[1]):
                    best = candidate

        if best is None or best[0] >= -1e-10:
            break
        delta, changes, assignments = best
        indices = np.asarray([index for index, _ in changes], dtype=int)
        change_vector = np.asarray([change for _, change in changes], dtype=float)
        vector[indices] += change_vector
        gradient += symmetric[:, indices] @ change_vector
        for task_id, uav_id in assignments:
            mapping[task_id] = uav_id
        energy += delta
        moves += 1

    return tuple(int(value) for value in vector), float(energy), moves


def _plan_key(plan):
    """Actual route objective, with total route duration as a deterministic tie-break."""
    return plan.mission_end_time, sum(route.return_time for route in plan.uav_routes)


def _decode_state(scenario, encoding, state):
    return decode_assignment_state(
        scenario, encoding, state, source_name="ORBIT + route-aware local search",
    )


def _canonical_state_from_plan(plan, encoding):
    mapping = {assignment.task_id: assignment.uav_id for assignment in plan.task_assignments}
    return _state(mapping, encoding)


def _route_return_time(scenario, uav_id, task_ids, task_by_id=None):
    """Score one assignment bucket exactly as the deterministic decoder does."""
    uav = scenario.uav(uav_id)
    task_by_id = task_by_id or {task.id: task for task in scenario.tasks}
    base = scenario.base(uav.home_base_id).location
    location = base
    clock = 0.0
    remaining = set(task_ids)
    while remaining:
        task_id = min(
            remaining,
            key=lambda item: (
                travel_time(location, task_by_id[item].location, uav.speed), item,
            ),
        )
        task = task_by_id[task_id]
        arrival = clock + travel_time(location, task.location, uav.speed)
        clock = max(arrival, task.earliest_start or 0.0) + task.service_duration
        location = task.location
        remaining.remove(task_id)
    return clock + travel_time(location, base, uav.speed) if task_ids else 0.0


def refine_route_makespan(scenario, encoding, initial_state):
    """Improve decoded makespan using moves and swaps from the critical route.

    QUBO energy is deliberately not used here: each candidate is sequenced and
    scored by the mission objective that is ultimately reported to operators.
    """
    # Canonicalise through the decoder first. Raw probabilistic samples can still
    # contain missing or duplicate assignments; route refinement must operate on
    # the complete feasible assignment produced by the documented repair layer.
    repaired_plan = _decode_state(scenario, encoding, tuple(initial_state))
    state = _canonical_state_from_plan(repaired_plan, encoding)
    mapping = _mapping(state, encoding)
    task_by_id = {task.id: task for task in scenario.tasks}
    assigned = {uav.id: set() for uav in scenario.uavs}
    for task_id, uav_id in mapping.items():
        assigned[uav_id].add(task_id)
    route_times = {
        uav.id: _route_return_time(scenario, uav.id, assigned[uav.id], task_by_id)
        for uav in scenario.uavs
    }
    move_count = swap_count = 0
    maximum_iterations = max(1, 2 * len(scenario.tasks))

    def route_key(updates=None):
        updates = updates or {}
        values = [updates.get(uav.id, route_times[uav.id]) for uav in scenario.uavs]
        return max(values, default=0.0), sum(values)

    for _ in range(maximum_iterations):
        current_key = route_key()
        critical = {uav_id for uav_id, value in route_times.items()
                    if abs(value - current_key[0]) <= 1e-9}
        critical_tasks = [task for task in scenario.tasks if mapping[task.id] in critical]

        best_move = None
        for task in critical_tasks:
            source_id = mapping[task.id]
            for uav in scenario.uavs:
                if uav.id == source_id or task.required_sensor not in uav.sensors:
                    continue
                source_tasks = assigned[source_id] - {task.id}
                target_tasks = assigned[uav.id] | {task.id}
                updates = {
                    source_id: _route_return_time(scenario, source_id, source_tasks, task_by_id),
                    uav.id: _route_return_time(scenario, uav.id, target_tasks, task_by_id),
                }
                candidate = (route_key(updates), task.id, uav.id, updates)
                if candidate[0] < current_key and (
                    best_move is None or candidate[:3] < best_move[:3]
                ):
                    best_move = candidate

        if best_move is not None:
            _, task_id, target_id, updates = best_move
            source_id = mapping[task_id]
            assigned[source_id].remove(task_id)
            assigned[target_id].add(task_id)
            mapping[task_id] = target_id
            route_times.update(updates)
            move_count += 1
            continue

        best_swap = None
        for left in critical_tasks:
            for right in scenario.tasks:
                if mapping[left.id] == mapping[right.id]:
                    continue
                left_uav, right_uav = scenario.uav(mapping[left.id]), scenario.uav(mapping[right.id])
                if left.required_sensor not in right_uav.sensors or right.required_sensor not in left_uav.sensors:
                    continue
                left_tasks = (assigned[left_uav.id] - {left.id}) | {right.id}
                right_tasks = (assigned[right_uav.id] - {right.id}) | {left.id}
                updates = {
                    left_uav.id: _route_return_time(scenario, left_uav.id, left_tasks, task_by_id),
                    right_uav.id: _route_return_time(scenario, right_uav.id, right_tasks, task_by_id),
                }
                candidate = (route_key(updates), left.id, right.id, updates)
                if candidate[0] < current_key and (
                    best_swap is None or candidate[:3] < best_swap[:3]
                ):
                    best_swap = candidate
        if best_swap is None:
            break
        _, left_id, right_id, updates = best_swap
        left_uav_id, right_uav_id = mapping[left_id], mapping[right_id]
        assigned[left_uav_id].remove(left_id)
        assigned[left_uav_id].add(right_id)
        assigned[right_uav_id].remove(right_id)
        assigned[right_uav_id].add(left_id)
        mapping[left_id], mapping[right_id] = right_uav_id, left_uav_id
        route_times.update(updates)
        swap_count += 1

    state = _state(mapping, encoding)
    plan = _decode_state(scenario, encoding, state)
    return state, plan, move_count, swap_count


class OrbitHybridSolver:
    """Canonical V2 ORBIT sampler plus separately attributed local refinement."""

    name = "orbit_hybrid"

    def __init__(self, backend: OrbitBackend | None = None,
                 v2_config: GeographicV2Config = GeographicV2Config(
                     assignment_penalty=12.0, base_weight=0.75, cluster_weight=0.25, workload_weight=1.5,
                 )):
        self.backend = backend; self.v2_config = v2_config

    def solve(self, scenario: MissionScenario, config: SolverConfig = SolverConfig()) -> SolverResult:
        started = time.perf_counter(); encoding = GeographicAssignmentV2Encoding(self.v2_config).encode(scenario)
        encoded = time.perf_counter(); backend = self.backend or OrbitSdkSimulatorBackend(config)
        try:
            response = backend.optimise(encoding); sampled = time.perf_counter()
            raw_map = response.metadata.get("best_sample", response.samples[0])
            raw_state = tuple(int(raw_map[name]) for name in encoding.variable_order)
            raw_energy = _energy(raw_state, np.asarray(encoding.qubo_matrix))
            refined_state, refined_energy, moves = refine_assignment_state(scenario, encoding, raw_state)
            refined = time.perf_counter()
            repaired_plan = decode_assignment_state(
                scenario, encoding, refined_state,
                source_name="ORBIT + deterministic QUBO local search",
                source_metadata=response.metadata,
            )
            assignment_repairs = int(repaired_plan.metadata.get("assignment_repairs", 0))
            canonical_state = _canonical_state_from_plan(repaired_plan, encoding)
            route_state, route_plan, route_moves, route_swaps = refine_route_makespan(
                scenario, encoding, canonical_state,
            )
            route_refined = time.perf_counter()
            greedy_result = GreedySolver().solve(scenario, config)
            fallback_used = bool(
                greedy_result.mission_plan
                and _plan_key(greedy_result.mission_plan) < _plan_key(route_plan)
            )
            plan = greedy_result.mission_plan if fallback_used else route_plan
            assert plan is not None
            finished = time.perf_counter()
            metadata = {
                "execution_mode": backend.mode.value, "encoding_time": encoded-started,
                "orbit_execution_time": sampled-encoded, "local_search_time": refined-sampled,
                "route_refinement_time": route_refined-refined,
                "fallback_evaluation_time": finished-route_refined,
                "decoding_time": finished-refined, "raw_orbit_energy": raw_energy,
                "refined_energy": refined_energy, "local_moves": moves,
                "raw_orbit_state": raw_state, "refined_state": refined_state,
                "route_refined_state": route_state,
                "assignment_repairs": assignment_repairs,
                "route_aware_moves": route_moves, "route_aware_swaps": route_swaps,
                "route_refined_makespan": route_plan.mission_end_time,
                "greedy_fallback_makespan": greedy_result.objective_value,
                "greedy_fallback_used": fallback_used,
                "ground_state_claim": False,
                "attribution": "Raw ORBIT, QUBO refinement, route-aware refinement, and greedy fallback are reported separately.",
                **response.metadata,
            }
            plan_metadata = {
                **plan.metadata,
                **response.metadata,
                "assignment_backend": (
                    "greedy makespan safety fallback" if fallback_used
                    else "ORBIT + QUBO and route-aware local search"
                ),
                "probabilistic_candidate_generated": True,
                "greedy_fallback_used": fallback_used,
                "route_aware_moves": route_moves,
                "route_aware_swaps": route_swaps,
                "assignment_repairs": assignment_repairs,
                "route_refined_makespan": route_plan.mission_end_time,
                "greedy_fallback_makespan": greedy_result.objective_value,
                "hardware_execution": False,
            }
            plan = replace(
                plan,
                solver_name="orbit_hybrid_greedy_fallback" if fallback_used else "orbit_route_aware_hybrid",
                metadata=plan_metadata,
            )
            return SolverResult(SolverStatus.FEASIBLE, plan, plan.objective_value, finished-started, metadata)
        except NotImplementedError as exc:
            return SolverResult(SolverStatus.UNSUPPORTED, None, None, time.perf_counter()-started,
                                {"execution_mode":backend.mode.value,"reason":str(exc)})
