from __future__ import annotations

import argparse
import json
from pathlib import Path

from .benchmark import benchmark_scale, get_solver, save_benchmark_results
from .evaluation import validate_plan
from .generation import generate_and_save
from .models import MissionPlan, MissionScenario
from .solvers import SolverConfig
from .visualisation import plot_gantt, plot_mission_map


def _generate(args: argparse.Namespace) -> int:
    path = generate_and_save(args.scale, args.seed, args.output)
    print(path)
    return 0


def _solve(args: argparse.Namespace) -> int:
    scenario = MissionScenario.read_json(args.scenario)
    result = get_solver(args.solver).solve(scenario, SolverConfig(
        seed=args.seed,
        timeout_seconds=args.timeout,
        orbit_full_sweeps=args.orbit_sweeps,
        orbit_replicas=args.orbit_replicas,
        orbit_processes=args.orbit_processes,
    ))
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    result_path = output_dir / f"{scenario.scenario_id}_{args.solver}_result.json"
    result.to_json(result_path)
    if result.mission_plan is None:
        print(f"{result.status.value}: {result_path}")
        return 2 if result.status.value in {"ERROR", "INFEASIBLE"} else 0
    plan = result.mission_plan
    plan_path = output_dir / f"{scenario.scenario_id}_{args.solver}_plan.json"
    report_path = output_dir / f"{scenario.scenario_id}_{args.solver}_validation.json"
    plan.to_json(plan_path)
    report = validate_plan(scenario, plan)
    report.to_json(report_path)
    if not args.no_figures:
        plot_mission_map(scenario, plan, Path(args.figure_dir) / f"{scenario.scenario_id}_{args.solver}_map.png")
        plot_gantt(plan, Path(args.figure_dir) / f"{scenario.scenario_id}_{args.solver}_gantt.png")
    print(json.dumps({"status": result.status.value, "feasible": report.feasible, "objective": result.objective_value,
                      "conflicts": len(report.conflicts), "plan": str(plan_path), "validation": str(report_path)}))
    return 0 if report.feasible else 2


def _validate(args: argparse.Namespace) -> int:
    scenario, plan = MissionScenario.read_json(args.scenario), MissionPlan.read_json(args.plan)
    report = validate_plan(scenario, plan, enforce_deadlines=args.enforce_deadlines,
                           enforce_maximum_mission_duration=args.enforce_endurance)
    if args.output:
        report.to_json(args.output)
    print(json.dumps(report.to_dict(), indent=2, sort_keys=True))
    return 0 if report.feasible else 2


def _benchmark(args: argparse.Namespace) -> int:
    results = benchmark_scale(args.scale, tuple(args.solvers))
    output = Path(args.output_dir)
    save_benchmark_results(results, output / f"{args.scale}_benchmark.json", output / f"{args.scale}_benchmark.csv")
    print(f"Wrote {len(results)} records to {output}")
    return 0


def _export_qubos(args: argparse.Namespace) -> int:
    from .benchmark.hardware_export import export_all
    records = export_all(args.scenario_dir, args.output_dir)
    print(f"Exported and verified {len(records)} hardware QUBOs to {args.output_dir}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="isr-mission-planning")
    commands = parser.add_subparsers(dest="command", required=True)
    export = commands.add_parser("export-qubos", help="Export all saved scenarios as hardware Matrix Market QUBOs")
    export.add_argument("--scenario-dir", default="data/scenarios")
    export.add_argument("--output-dir", default="data/q_matrices")
    export.set_defaults(handler=_export_qubos)
    generate = commands.add_parser("generate", help="Generate a deterministic synthetic scenario")
    generate.add_argument("--scale", choices=("small", "medium", "large"), default="small")
    generate.add_argument("--seed", type=int, default=42)
    generate.add_argument("--output")
    generate.set_defaults(handler=_generate)

    solve = commands.add_parser("solve", help="Solve, validate, and visualise a scenario")
    solve.add_argument("--scenario", required=True)
    solve.add_argument("--solver", choices=("greedy", "orbit", "orbit_hybrid", "orbit_pdit"), default="orbit_hybrid")
    solve.add_argument("--seed", type=int, default=42)
    solve.add_argument("--timeout", type=float)
    solve.add_argument("--orbit-sweeps", type=int, default=500)
    solve.add_argument("--orbit-replicas", type=int, default=4)
    solve.add_argument("--orbit-processes", type=int, default=1)
    solve.add_argument("--output-dir", default="outputs/plans")
    solve.add_argument("--figure-dir", default="outputs/figures")
    solve.add_argument("--no-figures", action="store_true")
    solve.set_defaults(handler=_solve)

    validate = commands.add_parser("validate", help="Independently validate a saved plan")
    validate.add_argument("--scenario", required=True)
    validate.add_argument("--plan", required=True)
    validate.add_argument("--output")
    validate.add_argument("--enforce-deadlines", action="store_true")
    validate.add_argument("--enforce-endurance", action="store_true")
    validate.set_defaults(handler=_validate)

    benchmark = commands.add_parser("benchmark", help="Benchmark saved scenarios across solvers")
    benchmark.add_argument("--scale", choices=("small", "medium", "large"), default="small")
    benchmark.add_argument("--solvers", nargs="+", choices=("greedy", "orbit", "orbit_hybrid", "orbit_pdit"), default=["greedy", "orbit_hybrid"])
    benchmark.add_argument("--output-dir", default="outputs/benchmark")
    benchmark.set_defaults(handler=_benchmark)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    return args.handler(args)
