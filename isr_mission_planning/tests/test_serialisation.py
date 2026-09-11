from isr_mission_planning.generation import generate_scenario
from isr_mission_planning.models import MissionPlan, MissionScenario
from isr_mission_planning.solvers import GreedySolver


def test_scenario_and_plan_round_trip(tmp_path):
    scenario = generate_scenario("small", 42)
    scenario_path = tmp_path / "scenario.json"
    scenario.to_json(scenario_path)
    restored = MissionScenario.read_json(scenario_path)
    assert restored == scenario
    plan = GreedySolver().solve(scenario).mission_plan
    plan_path = tmp_path / "plan.json"
    plan.to_json(plan_path)
    assert MissionPlan.read_json(plan_path) == plan
