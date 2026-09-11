from __future__ import annotations

from ..geometry import euclidean_distance, minimum_pairwise_separation
from ..models import MissionMetrics, MissionPlan, MissionScenario


def calculate_metrics(scenario: MissionScenario, plan: MissionPlan, number_of_conflicts: int = 0) -> MissionMetrics:
    makespan = max((route.return_time for route in plan.uav_routes), default=0.0) - plan.mission_start_time
    segments = [segment for route in plan.uav_routes for segment in route.trajectory_segments]
    total_distance = sum(euclidean_distance(segment.start, segment.end) for segment in segments)
    total_flight = sum(max(0.0, segment.end_time - segment.start_time) for segment in segments)
    completion = {task.task_id: task.finish_time for route in plan.uav_routes for task in route.scheduled_tasks}
    utilisation: dict[str, float] = {}
    for route in plan.uav_routes:
        service = sum(item.finish_time - item.start_time for item in route.scheduled_tasks)
        flight = sum(item.end_time - item.start_time for item in route.trajectory_segments)
        utilisation[route.uav_id] = 0.0 if makespan <= 0 else (service + flight) / makespan
    return MissionMetrics(makespan, total_distance, total_flight, utilisation, completion,
                          number_of_conflicts, minimum_pairwise_separation(segments))
