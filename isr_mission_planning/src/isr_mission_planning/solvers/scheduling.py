from __future__ import annotations

from collections.abc import Mapping, Sequence

from ..geometry import travel_time
from ..models import (MissionPlan, MissionScenario, ScheduledTask, TaskAssignment,
                      TrajectorySegment, UAVRoute)


def build_plan_from_sequences(
    scenario: MissionScenario, sequences: Mapping[str, Sequence[str]], solver_name: str,
    metadata: dict | None = None,
) -> MissionPlan:
    routes: list[UAVRoute] = []
    assignments: list[TaskAssignment] = []
    for uav in scenario.uavs:
        base = scenario.base(uav.home_base_id)
        location, location_id, clock = base.location, base.id, 0.0
        scheduled: list[ScheduledTask] = []
        segments: list[TrajectorySegment] = []
        for task_id in sequences.get(uav.id, ()):
            task = scenario.task(task_id)
            arrival = clock + travel_time(location, task.location, uav.speed)
            segments.append(TrajectorySegment(uav.id, location, task.location, clock, arrival, "travel", location_id, task.id))
            start = max(arrival, task.earliest_start or 0.0)
            finish = start + task.service_duration
            scheduled.append(ScheduledTask(task.id, start, finish))
            assignments.append(TaskAssignment(task.id, uav.id))
            location, location_id, clock = task.location, task.id, finish
        if scheduled:
            returned = clock + travel_time(location, base.location, uav.speed)
            segments.append(TrajectorySegment(uav.id, location, base.location, clock, returned, "travel", location_id, base.id))
        else:
            returned = 0.0
        routes.append(UAVRoute(uav.id, tuple(scheduled), tuple(segments), returned))
    mission_end = max((route.return_time for route in routes), default=0.0)
    return MissionPlan(scenario.scenario_id, solver_name, tuple(routes), tuple(assignments), 0.0, mission_end, mission_end, metadata or {})
