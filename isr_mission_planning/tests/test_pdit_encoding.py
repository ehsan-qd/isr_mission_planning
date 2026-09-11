import importlib.util
import random

import pytest

from isr_mission_planning.benchmark.ground_state import solve_qubo_exact
from isr_mission_planning.benchmark.pdit_ground_state import energy_equivalence_check, solve_categorical_exact
from isr_mission_planning.benchmark.pdit_sampling import run_pdit_sampling
from isr_mission_planning.generation import generate_scenario
from isr_mission_planning.solvers import GreedySolver, SolverConfig
from isr_mission_planning.solvers.orbit.encoding_v2 import GeographicAssignmentV2Encoding, GeographicV2Config
from isr_mission_planning.solvers.orbit.pdit_encoding import (
    build_categorical_v2_model,
    compute_pdit_energy,
    decode_one_hot_with_repairs,
    one_hot_to_assignment,
)
from isr_mission_planning.solvers.orbit.pdit_solver import OrbitPditSolver

V2_CONFIG = GeographicV2Config(assignment_penalty=12.0, base_weight=0.75, cluster_weight=0.25, workload_weight=1.5)


def _problem():
    scenario = generate_scenario("small", 42)
    v2_encoding = GeographicAssignmentV2Encoding(V2_CONFIG).encode(scenario)
    model = build_categorical_v2_model(scenario, V2_CONFIG)
    return scenario, v2_encoding, model


def test_categorical_domain_matches_sensor_eligibility():
    scenario, v2_encoding, model = _problem()
    for task in scenario.tasks:
        eligible = tuple(uav.id for uav in scenario.uavs if task.required_sensor in uav.sensors)
        assert set(model.task_states[task.id]) == set(eligible)


def test_no_exactly_one_penalty_term():
    _, _, model = _problem()
    assert model.constant == 0.0
    assert model.metadata["assignment_penalty"] is None


def test_exactly_one_by_construction_round_trip():
    scenario, _, model = _problem()
    assignment = {task.id: model.task_states[task.id][0] for task in scenario.tasks}
    one_hot = {name: 0 for name in model.variable_order}
    for task, uav in assignment.items():
        one_hot[f"assign::{uav}::{task}"] = 1
    decoded = one_hot_to_assignment(one_hot, model)
    assert decoded == assignment
    decoded_lenient, repairs = decode_one_hot_with_repairs(one_hot, model)
    assert decoded_lenient == assignment
    assert repairs == 0


def test_decode_repairs_invalid_state_deterministically():
    _, _, model = _problem()
    zero_state = {name: 0 for name in model.variable_order}
    with pytest.raises(ValueError):
        one_hot_to_assignment(zero_state, model)
    assignment, repairs = decode_one_hot_with_repairs(zero_state, model)
    assert repairs == len(model.task_states)
    assert set(assignment) == set(model.task_states)
    for task, uav in assignment.items():
        assert uav in model.task_states[task]


def test_energy_equivalence_at_v2_exact_ground_state():
    scenario, v2_encoding, model = _problem()
    exact = solve_qubo_exact(v2_encoding)
    mapping = {var.meaning["task_id"]: var.meaning["uav_id"]
               for bit, var in zip(exact.ground_state, v2_encoding.variables, strict=True) if bit}
    check = energy_equivalence_check(mapping, model, v2_encoding, V2_CONFIG.assignment_penalty)
    assert check["agrees"]


def test_energy_equivalence_at_greedy_assignment():
    scenario, v2_encoding, model = _problem()
    plan = GreedySolver().solve(scenario).mission_plan
    assignment = {item.task_id: item.uav_id for item in plan.task_assignments}
    check = energy_equivalence_check(assignment, model, v2_encoding, V2_CONFIG.assignment_penalty)
    assert check["agrees"]


def test_energy_equivalence_across_random_valid_assignments():
    scenario, v2_encoding, model = _problem()
    rng = random.Random(7)
    for _ in range(100):
        assignment = {}
        for task in scenario.tasks:
            eligible = [uav.id for uav in scenario.uavs if task.required_sensor in uav.sensors]
            assignment[task.id] = rng.choice(eligible)
        check = energy_equivalence_check(assignment, model, v2_encoding, V2_CONFIG.assignment_penalty)
        assert check["agrees"], check


def test_exact_categorical_optimum_matches_v2_exact_optimum():
    scenario, v2_encoding, model = _problem()
    v2_exact = solve_qubo_exact(v2_encoding)
    categorical_exact = solve_categorical_exact(model)
    assert categorical_exact.optimality_proven
    assert categorical_exact.ground_state == v2_exact.ground_state
    assignment = one_hot_to_assignment(dict(zip(model.variable_order, categorical_exact.ground_state, strict=True)), model)
    audited = compute_pdit_energy(assignment, model)
    assert audited == pytest.approx(categorical_exact.ground_state_energy)


@pytest.mark.skipif(importlib.util.find_spec("orbit_sdk") is None or importlib.util.find_spec("orbit_simulator") is None,
                    reason="optional local ORBIT packages are not installed")
def test_native_miqp_solve_produces_valid_one_hot_categorical_assignment():
    scenario, _, model = _problem()
    result = OrbitPditSolver().solve(scenario, SolverConfig(seed=42, orbit_full_sweeps=200, orbit_replicas=4, orbit_processes=1))
    assert result.solver_metadata["native_pdit_execution"] is True
    assert result.solver_metadata["representation"] == "categorical_pdit"
    assignment = result.solver_metadata["raw_pdit_assignment"]
    assert set(assignment) == set(model.task_states)
    for task, uav in assignment.items():
        assert uav in model.task_states[task]


@pytest.mark.skipif(importlib.util.find_spec("orbit_sdk") is None or importlib.util.find_spec("orbit_simulator") is None,
                    reason="optional local ORBIT packages are not installed")
def test_pdit_sampling_run_independently_audits_energies():
    scenario, _, model = _problem()
    run = run_pdit_sampling(model, 200, config=SolverConfig(orbit_replicas=4, orbit_processes=1))
    assert run.actual_samples == 200
    assert run.best_energy == min(run.independently_audited_energies)
