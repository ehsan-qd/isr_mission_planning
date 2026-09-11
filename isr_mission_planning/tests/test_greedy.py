from isr_mission_planning.evaluation import validate_plan
from isr_mission_planning.generation import generate_scenario
from isr_mission_planning.models import SolverStatus
from isr_mission_planning.solvers import GreedySolver


def test_greedy_produces_feasible_complete_plan():
    scenario = generate_scenario("small", 42)
    result = GreedySolver().solve(scenario)
    assert result.status == SolverStatus.FEASIBLE
    report = validate_plan(scenario, result.mission_plan)
    assert report.feasible
    assert len(result.mission_plan.task_assignments) == len(scenario.tasks)
