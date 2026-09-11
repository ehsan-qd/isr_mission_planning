from __future__ import annotations

import time

from ..geometry import travel_time
from ..models import MissionScenario, SolverResult, SolverStatus
from .base import SolverConfig
from .scheduling import build_plan_from_sequences


class GreedySolver:
    name = "greedy"

    def solve(self, scenario: MissionScenario, config: SolverConfig = SolverConfig()) -> SolverResult:
        started = time.perf_counter()
        sequences: dict[str, list[str]] = {uav.id: [] for uav in scenario.uavs}
        locations = {uav.id: scenario.base(uav.home_base_id).location for uav in scenario.uavs}
        clocks = {uav.id: 0.0 for uav in scenario.uavs}
        tasks = sorted(scenario.tasks, key=lambda task: (-task.priority, task.id))
        for task in tasks:
            eligible = [uav for uav in scenario.uavs if task.required_sensor in uav.sensors]
            if not eligible:
                return SolverResult(SolverStatus.INFEASIBLE, None, None, time.perf_counter() - started,
                                    {"reason": f"No UAV supports {task.required_sensor.value} for {task.id}"})
            def projected(uav):
                arrival = clocks[uav.id] + travel_time(locations[uav.id], task.location, uav.speed)
                finish = max(arrival, task.earliest_start or 0.0) + task.service_duration
                home = scenario.base(uav.home_base_id).location
                return finish + travel_time(task.location, home, uav.speed)

            chosen = min(eligible, key=lambda uav: (projected(uav), uav.id))
            arrival = clocks[chosen.id] + travel_time(locations[chosen.id], task.location, chosen.speed)
            clocks[chosen.id] = max(arrival, task.earliest_start or 0.0) + task.service_duration
            locations[chosen.id] = task.location
            sequences[chosen.id].append(task.id)
        plan = build_plan_from_sequences(scenario, sequences, self.name, {"heuristic": "priority_then_incremental_completion"})
        return SolverResult(SolverStatus.FEASIBLE, plan, plan.objective_value, time.perf_counter() - started)
