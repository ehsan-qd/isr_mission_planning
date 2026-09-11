import json

import numpy as np
import pytest

from isr_mission_planning.benchmark.ground_state import exhaustive_ground_state
from isr_mission_planning.benchmark.sample_analysis import assignment_violations
from isr_mission_planning.models import (BaseStation, MissionScenario, MissionTask,
                                         OperatingArea, SensorType, UAV, Waypoint)
from isr_mission_planning.solvers.orbit.encoding_v2 import (GeographicAssignmentV2Encoding,
                                                            GeographicV2Config,
                                                            decompose_v2_energy)


def controlled_scenario():
    return MissionScenario(
        "controlled", OperatingArea(200, 100),
        (BaseStation("B", Waypoint(0, 0)), BaseStation("B2", Waypoint(100, 0))),
        (UAV("U1", "B", 20, (SensorType.EO,)), UAV("U2", "B", 20, (SensorType.EO, SensorType.IR))),
        (MissionTask("T1", Waypoint(10, 0), SensorType.EO, 2, 1),
         MissionTask("T2", Waypoint(12, 0), SensorType.EO, 2, 1),
         MissionTask("T3", Waypoint(-90, 0), SensorType.EO, 2, 1),
         MissionTask("T4", Waypoint(15, 5), SensorType.IR, 2, 1)),
        metadata={"scale": "test"},
    )


def state_for(encoding, assignments):
    return tuple(int(assignments.get(v.meaning["task_id"]) == v.meaning["uav_id"]) for v in encoding.variables)


def test_nearby_task_cluster_costs_less_than_distant_cluster():
    scenario = controlled_scenario()
    config = GeographicV2Config(base_weight=0, workload_weight=0, cluster_weight=1)
    encoding = GeographicAssignmentV2Encoding(config).encode(scenario)
    near = state_for(encoding, {"T1": "U1", "T2": "U1", "T3": "U2"})
    far = state_for(encoding, {"T1": "U1", "T2": "U2", "T3": "U1"})
    near_energy = decompose_v2_energy(near, scenario, config)["geographic_cluster"]
    far_energy = decompose_v2_energy(far, scenario, config)["geographic_cluster"]
    assert 0 <= near_energy < far_energy


def test_geographic_term_never_rewards_task_pile_up():
    scenario = controlled_scenario()
    config = GeographicV2Config(base_weight=0, workload_weight=0, cluster_weight=1)
    encoding = GeographicAssignmentV2Encoding(config).encode(scenario)
    one_pair = state_for(encoding, {"T1": "U1", "T2": "U1", "T3": "U2", "T4": "U2"})
    three_together = state_for(encoding, {"T1": "U1", "T2": "U1", "T3": "U1", "T4": "U2"})
    pair_energy = decompose_v2_energy(one_pair, scenario, config)["geographic_cluster"]
    piled_energy = decompose_v2_energy(three_together, scenario, config)["geographic_cluster"]
    assert pair_energy >= 0
    assert piled_energy > pair_energy


def test_base_proximity_prefers_closer_faster_uav():
    scenario = controlled_scenario()
    # Put U2 at the distant base; T1 is close to U1.
    scenario = MissionScenario(scenario.scenario_id, scenario.operating_area, scenario.bases,
                               (scenario.uavs[0], UAV("U2", "B2", 10, (SensorType.EO,))), scenario.tasks[:1])
    config = GeographicV2Config(cluster_weight=0, workload_weight=0, base_weight=1)
    encoding = GeographicAssignmentV2Encoding(config).encode(scenario)
    close = state_for(encoding, {"T1": "U1"})
    far = state_for(encoding, {"T1": "U2"})
    assert decompose_v2_energy(close, scenario, config)["base_proximity"] < decompose_v2_energy(far, scenario, config)["base_proximity"]


def test_workload_balance_prefers_two_tasks_each():
    scenario = controlled_scenario()
    scenario = MissionScenario(scenario.scenario_id, scenario.operating_area, scenario.bases[:1], scenario.uavs, scenario.tasks[:3])
    config = GeographicV2Config(cluster_weight=0, base_weight=0, workload_weight=1)
    encoding = GeographicAssignmentV2Encoding(config).encode(scenario)
    balanced = state_for(encoding, {"T1": "U1", "T2": "U1", "T3": "U2"})
    imbalanced = state_for(encoding, {"T1": "U1", "T2": "U1", "T3": "U1"})
    assert decompose_v2_energy(balanced, scenario, config)["workload_balance"] < decompose_v2_energy(imbalanced, scenario, config)["workload_balance"]


def test_sensor_ineligible_variables_are_omitted_and_tiny_ground_is_feasible():
    scenario = controlled_scenario()
    encoding = GeographicAssignmentV2Encoding().encode(scenario)
    assert not any(v.meaning == {"uav_id": "U1", "task_id": "T4"} for v in encoding.variables)
    assert any(v.meaning == {"uav_id": "U2", "task_id": "T4"} for v in encoding.variables)
    feasible_scenario = MissionScenario(scenario.scenario_id, scenario.operating_area, scenario.bases[:1], scenario.uavs, scenario.tasks[:3])
    feasible_encoding = GeographicAssignmentV2Encoding().encode(feasible_scenario)
    exact = exhaustive_ground_state(feasible_encoding, maximum_variables=10)
    assert not assignment_violations(exact.ground_state, feasible_encoding)


def test_components_sum_coefficients_are_finite_and_config_serialises():
    scenario = controlled_scenario()
    scenario = MissionScenario(scenario.scenario_id, scenario.operating_area, scenario.bases[:1], scenario.uavs, scenario.tasks[:3])
    config = GeographicV2Config(assignment_penalty=12, base_weight=.75, cluster_weight=.25, workload_weight=1.5)
    encoding = GeographicAssignmentV2Encoding(config).encode(scenario)
    state = state_for(encoding, {"T1": "U1", "T2": "U1", "T3": "U2"})
    components = decompose_v2_energy(state, scenario, config)
    matrix = np.asarray(encoding.qubo_matrix)
    assert components["total"] == pytest.approx(float(np.asarray(state) @ matrix @ np.asarray(state)))
    assert np.isfinite(matrix).all()
    assert np.abs(matrix).max() <= 2 * config.assignment_penalty + 1e-8
    assert json.loads(json.dumps(config.to_dict()))["formulation_version"] == "2.1"
