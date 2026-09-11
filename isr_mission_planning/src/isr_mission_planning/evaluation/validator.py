from __future__ import annotations

from collections import Counter

from ..geometry import detect_conflicts, euclidean_distance, travel_time
from ..models import MissionPlan, MissionScenario, ValidationIssue, ValidationReport
from .metrics import calculate_metrics


def validate_plan(
    scenario: MissionScenario, plan: MissionPlan, *, enforce_deadlines: bool = False,
    enforce_maximum_mission_duration: bool = False, tolerance: float = 1e-6,
) -> ValidationReport:
    issues: list[ValidationIssue] = []
    if plan.scenario_id != scenario.scenario_id:
        issues.append(ValidationIssue("SCENARIO_MISMATCH", "Plan and scenario IDs do not match"))

    assignment_ids = [item.task_id for item in plan.task_assignments]
    scheduled_ids = [item.task_id for route in plan.uav_routes for item in route.scheduled_tasks]
    expected = {item.id for item in scenario.tasks}
    for task_id in sorted(expected - set(scheduled_ids)):
        issues.append(ValidationIssue("MISSING_TASK", f"Task {task_id} is not scheduled"))
    for task_id, count in Counter(scheduled_ids).items():
        if count > 1:
            issues.append(ValidationIssue("DUPLICATE_TASK", f"Task {task_id} is scheduled {count} times"))
    for task_id, count in Counter(assignment_ids).items():
        if count > 1:
            issues.append(ValidationIssue("DUPLICATE_ASSIGNMENT", f"Task {task_id} has {count} assignments"))
    if Counter(assignment_ids) != Counter(scheduled_ids):
        issues.append(ValidationIssue("ASSIGNMENT_SCHEDULE_MISMATCH", "Assignment list and routes disagree"))
    assignment_pairs = Counter((item.task_id, item.uav_id) for item in plan.task_assignments)
    scheduled_pairs = Counter((item.task_id, route.uav_id) for route in plan.uav_routes for item in route.scheduled_tasks)
    if assignment_pairs != scheduled_pairs:
        issues.append(ValidationIssue("ASSIGNMENT_ROUTE_MISMATCH", "Assignment UAVs and route UAVs disagree"))

    seen_uavs: set[str] = set()
    for route in plan.uav_routes:
        if route.uav_id in seen_uavs:
            issues.append(ValidationIssue("DUPLICATE_ROUTE", f"Multiple routes exist for {route.uav_id}"))
            continue
        seen_uavs.add(route.uav_id)
        try:
            uav = scenario.uav(route.uav_id)
        except StopIteration:
            issues.append(ValidationIssue("UNKNOWN_UAV", f"Unknown UAV {route.uav_id}"))
            continue
        base = scenario.base(uav.home_base_id)
        location, clock = base.location, 0.0
        ordered = list(route.scheduled_tasks)
        expected_segment_count = len(ordered) + 1 if ordered else 0
        if len(route.trajectory_segments) != expected_segment_count:
            issues.append(ValidationIssue("INVALID_TRAJECTORY_COUNT", f"{uav.id} has an inconsistent trajectory segment count"))
        for index, scheduled in enumerate(ordered):
            try:
                task = scenario.task(scheduled.task_id)
            except StopIteration:
                issues.append(ValidationIssue("UNKNOWN_TASK", f"Unknown task {scheduled.task_id}"))
                continue
            if task.required_sensor not in uav.sensors:
                issues.append(ValidationIssue("UNSUPPORTED_SENSOR", f"{uav.id} cannot perform {task.id}"))
            earliest_arrival = clock + travel_time(location, task.location, uav.speed)
            if index < len(route.trajectory_segments):
                segment = route.trajectory_segments[index]
                if (euclidean_distance(segment.start, location) > tolerance or
                        euclidean_distance(segment.end, task.location) > tolerance or
                        abs(segment.start_time - clock) > tolerance or
                        abs(segment.end_time - earliest_arrival) > tolerance):
                    issues.append(ValidationIssue("INVALID_TRAJECTORY", f"Trajectory into {task.id} is inconsistent"))
            if scheduled.start_time + tolerance < earliest_arrival:
                issues.append(ValidationIssue("INVALID_TRAVEL_TIME", f"{uav.id} cannot reach {task.id} by {scheduled.start_time:.6f}"))
            if task.earliest_start is not None and scheduled.start_time + tolerance < task.earliest_start:
                issues.append(ValidationIssue("EARLY_START", f"{task.id} starts before its earliest start"))
            if abs((scheduled.finish_time - scheduled.start_time) - task.service_duration) > tolerance:
                issues.append(ValidationIssue("INVALID_SERVICE_DURATION", f"{task.id} service duration is incorrect"))
            if scheduled.start_time + tolerance < clock:
                issues.append(ValidationIssue("TASK_OVERLAP", f"Tasks overlap on {uav.id}"))
            if enforce_deadlines and task.deadline is not None and scheduled.finish_time > task.deadline + tolerance:
                issues.append(ValidationIssue("DEADLINE_VIOLATION", f"{task.id} misses its deadline"))
            location, clock = task.location, scheduled.finish_time
        expected_return = clock + travel_time(location, base.location, uav.speed) if ordered else 0.0
        if abs(route.return_time - expected_return) > tolerance:
            issues.append(ValidationIssue("INVALID_RETURN_TIME", f"{uav.id} return time is inconsistent"))
        if ordered:
            if not route.trajectory_segments:
                issues.append(ValidationIssue("MISSING_TRAJECTORY", f"{uav.id} has no trajectory"))
            else:
                final = route.trajectory_segments[-1]
                if euclidean_distance(final.end, base.location) > tolerance:
                    issues.append(ValidationIssue("INVALID_RETURN_BASE", f"{uav.id} does not return home"))
                if (euclidean_distance(final.start, location) > tolerance or abs(final.start_time - clock) > tolerance or
                        abs(final.end_time - expected_return) > tolerance):
                    issues.append(ValidationIssue("INVALID_RETURN_TRAJECTORY", f"{uav.id} return trajectory is inconsistent"))
        if enforce_maximum_mission_duration and uav.maximum_mission_duration is not None and route.return_time > uav.maximum_mission_duration + tolerance:
            issues.append(ValidationIssue("ENDURANCE_VIOLATION", f"{uav.id} exceeds maximum mission duration"))

    for missing_uav in sorted({uav.id for uav in scenario.uavs} - seen_uavs):
        issues.append(ValidationIssue("MISSING_ROUTE", f"No route exists for {missing_uav}"))
    expected_mission_end = max((route.return_time for route in plan.uav_routes), default=plan.mission_start_time)
    if abs(plan.mission_end_time - expected_mission_end) > tolerance:
        issues.append(ValidationIssue("INVALID_MISSION_END", "Mission end does not match the last UAV return"))

    segments = [segment for route in plan.uav_routes for segment in route.trajectory_segments]
    conflicts = detect_conflicts(segments, scenario.minimum_separation)
    for conflict in conflicts:
        issues.append(ValidationIssue("SPATIAL_CONFLICT", f"{conflict.uav_a}/{conflict.uav_b} separation {conflict.minimum_separation:.3f}", "warning"))
    metrics = calculate_metrics(scenario, plan, len(conflicts))
    hard_errors = any(issue.severity == "error" for issue in issues)
    return ValidationReport(not hard_errors, tuple(issues), metrics, conflicts)
