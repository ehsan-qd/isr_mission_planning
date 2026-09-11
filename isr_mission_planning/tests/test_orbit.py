import numpy as np
import pytest

from isr_mission_planning.benchmark.energy import compute_qubo_energy
from isr_mission_planning.benchmark.ground_state import solve_qubo_exact
from isr_mission_planning.evaluation import validate_plan
from isr_mission_planning.generation import generate_scenario
from isr_mission_planning.solvers.orbit.backend import BackendResponse, OrbitExecutionMode
from isr_mission_planning.solvers.orbit.decoder import decode_assignment_state, decode_response
from isr_mission_planning.solvers.orbit.encoding import AssignmentSequencingEncoding
from isr_mission_planning.solvers.orbit.encoding_v2 import GeographicAssignmentV2Encoding, GeographicV2Config
from isr_mission_planning.solvers.orbit.hybrid import (
    OrbitHybridSolver, _energy, _neighbours, refine_assignment_state,
    refine_route_makespan,
)
from isr_mission_planning.solvers.greedy import GreedySolver


def test_assignment_qubo_and_decoder_boundary():
    scenario = generate_scenario("small", 42)
    encoding = AssignmentSequencingEncoding().encode(scenario)
    assert len(encoding.qubo_matrix) == len(encoding.variable_order)
    assert all(len(row) == len(encoding.variable_order) for row in encoding.qubo_matrix)
    # An all-zero backend state intentionally exercises deterministic repair.
    state = {name: 0 for name in encoding.variable_order}
    plan = decode_response(scenario, encoding, BackendResponse((state,), {"best_sample": state}))
    assert plan.metadata["assignment_repairs"] == len(scenario.tasks)
    assert validate_plan(scenario, plan).feasible


def test_hybrid_solver_keeps_raw_and_refined_attribution_separate():
    scenario = generate_scenario("small", 42)
    config = GeographicV2Config(assignment_penalty=12.0, base_weight=0.75, cluster_weight=0.25, workload_weight=1.5)
    encoding = GeographicAssignmentV2Encoding(config).encode(scenario)
    exact = solve_qubo_exact(encoding)
    mapping = {variable.meaning["task_id"]: variable.meaning["uav_id"]
               for bit, variable in zip(exact.ground_state, encoding.variables, strict=True) if bit}
    task = next(task for task in scenario.tasks
                if sum(task.required_sensor in uav.sensors for uav in scenario.uavs) > 1)
    alternative = next(uav.id for uav in scenario.uavs if task.required_sensor in uav.sensors and uav.id != mapping[task.id])
    mapping[task.id] = alternative
    raw = tuple(int(mapping[var.meaning["task_id"]] == var.meaning["uav_id"]) for var in encoding.variables)
    class Backend:
        mode = OrbitExecutionMode.SIMULATOR

        def optimise(self, supplied_encoding):
            sample = dict(zip(supplied_encoding.variable_order, raw, strict=True))
            return BackendResponse((sample,), {"best_sample": sample, "minimum_qubo_energy": compute_qubo_energy(raw, supplied_encoding)})

    result = OrbitHybridSolver(backend=Backend()).solve(scenario)
    assert result.solver_metadata["raw_orbit_state"] == raw
    assert result.solver_metadata["refined_energy"] <= result.solver_metadata["raw_orbit_energy"]
    assert result.solver_metadata["ground_state_claim"] is False
    assert result.solver_metadata["route_refined_makespan"] <= result.solver_metadata["greedy_fallback_makespan"] or result.solver_metadata["greedy_fallback_used"]


def test_hybrid_never_returns_worse_makespan_than_greedy_baseline():
    scenario = generate_scenario("medium", 42)
    config = GeographicV2Config(assignment_penalty=12.0, base_weight=0.75, cluster_weight=0.25, workload_weight=1.5)
    encoding = GeographicAssignmentV2Encoding(config).encode(scenario)
    # Deliberately overload the fastest flexible UAV to exercise route refinement
    # and the baseline safety net without relying on stochastic simulator output.
    overloaded = scenario.uav("UAV_14")
    mapping = {}
    for task in scenario.tasks:
        eligible = [uav for uav in scenario.uavs if task.required_sensor in uav.sensors]
        mapping[task.id] = overloaded.id if task.required_sensor in overloaded.sensors else eligible[0].id
    raw = tuple(int(mapping[var.meaning["task_id"]] == var.meaning["uav_id"]) for var in encoding.variables)
    initial_plan = decode_assignment_state(
        scenario, encoding, raw, source_name="pathological test assignment",
    )
    _, route_plan, route_moves, _ = refine_route_makespan(scenario, encoding, raw)
    assert route_moves > 0
    assert route_plan.mission_end_time < initial_plan.mission_end_time

    class Backend:
        mode = OrbitExecutionMode.SIMULATOR

        def optimise(self, supplied_encoding):
            sample = dict(zip(supplied_encoding.variable_order, raw, strict=True))
            return BackendResponse((sample,), {"best_sample": sample})

    hybrid = OrbitHybridSolver(backend=Backend()).solve(scenario)
    greedy = GreedySolver().solve(scenario)
    assert hybrid.mission_plan is not None
    assert greedy.mission_plan is not None
    assert hybrid.mission_plan.mission_end_time <= greedy.mission_plan.mission_end_time


def test_route_refinement_canonicalises_incomplete_sample():
    scenario = generate_scenario("small", 42)
    encoding = GeographicAssignmentV2Encoding().encode(scenario)
    incomplete = tuple(0 for _ in encoding.variables)
    state, plan, _, _ = refine_route_makespan(scenario, encoding, incomplete)
    assert len(plan.task_assignments) == len(scenario.tasks)
    assert sum(state) == len(scenario.tasks)
    assert validate_plan(scenario, plan).feasible


def test_incremental_qubo_refinement_reaches_a_true_neighbourhood_minimum():
    scenario = generate_scenario("small", 42)
    encoding = GeographicAssignmentV2Encoding().encode(scenario)
    initial = tuple(
        int(variable.meaning["uav_id"] == next(
            uav.id for uav in scenario.uavs
            if scenario.task(variable.meaning["task_id"]).required_sensor in uav.sensors
        ))
        for variable in encoding.variables
    )
    state, energy, _ = refine_assignment_state(scenario, encoding, initial)
    matrix = np.asarray(encoding.qubo_matrix)
    assert energy == pytest.approx(_energy(state, matrix))
    assert all(_energy(neighbour, matrix) >= energy - 1e-9 for neighbour in _neighbours(state, scenario, encoding))
