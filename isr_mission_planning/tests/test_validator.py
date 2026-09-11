from dataclasses import replace

from isr_mission_planning.evaluation import validate_plan
from isr_mission_planning.generation import generate_scenario
from isr_mission_planning.models import ScheduledTask
from isr_mission_planning.solvers import GreedySolver


def plan_and_scenario():
    scenario = generate_scenario("small", 42)
    return scenario, GreedySolver().solve(scenario).mission_plan


def codes(report):
    return {issue.code for issue in report.issues}


def test_missing_and_duplicate_tasks_are_detected():
    scenario, plan = plan_and_scenario()
    route = next(route for route in plan.uav_routes if route.scheduled_tasks)
    missing_route = replace(route, scheduled_tasks=route.scheduled_tasks[1:])
    routes = tuple(missing_route if item.uav_id == route.uav_id else item for item in plan.uav_routes)
    assert "MISSING_TASK" in codes(validate_plan(scenario, replace(plan, uav_routes=routes)))
    duplicate_route = replace(route, scheduled_tasks=route.scheduled_tasks + (route.scheduled_tasks[0],))
    routes = tuple(duplicate_route if item.uav_id == route.uav_id else item for item in plan.uav_routes)
    assert "DUPLICATE_TASK" in codes(validate_plan(scenario, replace(plan, uav_routes=routes)))


def test_invalid_timing_is_detected():
    scenario, plan = plan_and_scenario()
    route = next(route for route in plan.uav_routes if route.scheduled_tasks)
    first = route.scheduled_tasks[0]
    impossible = ScheduledTask(first.task_id, 0.0, first.finish_time - first.start_time)
    altered = replace(route, scheduled_tasks=(impossible,) + route.scheduled_tasks[1:])
    routes = tuple(altered if item.uav_id == route.uav_id else item for item in plan.uav_routes)
    assert "INVALID_TRAVEL_TIME" in codes(validate_plan(scenario, replace(plan, uav_routes=routes)))


def test_overlap_and_unsupported_sensor_are_detected():
    scenario, plan = plan_and_scenario()
    route = next(route for route in plan.uav_routes if len(route.scheduled_tasks) >= 2)
    first, second = route.scheduled_tasks[:2]
    overlap = ScheduledTask(second.task_id, first.start_time, first.start_time + (second.finish_time - second.start_time))
    altered = replace(route, scheduled_tasks=(first, overlap) + route.scheduled_tasks[2:])
    routes = tuple(altered if item.uav_id == route.uav_id else item for item in plan.uav_routes)
    assert "TASK_OVERLAP" in codes(validate_plan(scenario, replace(plan, uav_routes=routes)))

    incompatible = next(
        (candidate, task) for candidate in scenario.uavs for task in scenario.tasks
        if task.required_sensor not in candidate.sensors
    )
    uav, task = incompatible
    target_route = next(item for item in plan.uav_routes if item.uav_id == uav.id)
    injected = replace(target_route, scheduled_tasks=(ScheduledTask(task.id, 0.0, task.service_duration),) + target_route.scheduled_tasks)
    routes = tuple(injected if item.uav_id == uav.id else item for item in plan.uav_routes)
    assert "UNSUPPORTED_SENSOR" in codes(validate_plan(scenario, replace(plan, uav_routes=routes)))
