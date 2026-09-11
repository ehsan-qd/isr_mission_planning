from isr_mission_planning.generation import generate_scenario


def test_generation_is_deterministic_and_seeded():
    assert generate_scenario("small", 42).to_dict() == generate_scenario("small", 42).to_dict()
    assert generate_scenario("small", 42).to_dict() != generate_scenario("small", 43).to_dict()


def test_feasible_generation_has_sensor_coverage():
    scenario = generate_scenario("small", 42)
    carried = {sensor for uav in scenario.uavs for sensor in uav.sensors}
    assert all(task.required_sensor in carried for task in scenario.tasks)
