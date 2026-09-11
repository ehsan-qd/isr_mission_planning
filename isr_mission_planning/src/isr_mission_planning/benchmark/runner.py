from __future__ import annotations

import time
from pathlib import Path

from ..evaluation import validate_plan
from ..generation import generate_and_save
from ..models import BenchmarkResult, MissionScenario
from ..solvers import GreedySolver, SolverConfig
from ..solvers.orbit import OrbitHybridSolver, OrbitPditSolver, OrbitSolver


SOLVERS = {"greedy": GreedySolver, "orbit": OrbitSolver, "orbit_hybrid": OrbitHybridSolver,
           "orbit_pdit": OrbitPditSolver}


def get_solver(name: str):
    try:
        return SOLVERS[name]()
    except KeyError as exc:
        raise ValueError(f"Unknown solver {name!r}; choose from {', '.join(SOLVERS)}") from exc


def benchmark_scenario(scenario: MissionScenario, solver_name: str, config: SolverConfig = SolverConfig()) -> BenchmarkResult:
    solver = get_solver(solver_name)
    result = solver.solve(scenario, config)
    validation_started = time.perf_counter()
    report = validate_plan(scenario, result.mission_plan, enforce_deadlines=config.enforce_deadlines,
                           enforce_maximum_mission_duration=config.enforce_maximum_mission_duration) if result.mission_plan else None
    validation_time = time.perf_counter() - validation_started
    metrics = report.metrics if report else None
    timing = {key: float(value) for key, value in result.solver_metadata.items() if key.endswith("_time") and isinstance(value, (int, float))}
    timing["validation_time"] = validation_time
    timing["total_runtime"] = result.runtime_seconds + validation_time
    return BenchmarkResult(
        scenario.scenario_id, str(scenario.metadata.get("scale", "unknown")), len(scenario.tasks), len(scenario.uavs),
        solver_name, result.status.value, result.objective_value, metrics.makespan if metrics else None,
        metrics.total_travel_distance if metrics else None, metrics.total_flight_time if metrics else None,
        result.runtime_seconds, report.feasible if report else False, metrics.number_of_conflicts if metrics else 0,
        metrics.minimum_separation if metrics else None, timing,
    )


def benchmark_scale(scale: str, solvers: tuple[str, ...] = ("greedy", "orbit_hybrid"), data_root: str | Path = "data/scenarios") -> list[BenchmarkResult]:
    directory = Path(data_root) / scale
    paths = sorted(directory.glob("*.json"))
    if not paths:
        paths = [generate_and_save(scale, seed, directory / f"{scale}_seed_{seed}.json") for seed in (42, 101, 2026)]
    return [benchmark_scenario(MissionScenario.read_json(path), solver) for path in paths for solver in solvers]
