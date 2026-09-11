"""Build the standalone GUI fixture from saved, independently validated planner outputs."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path


GUI_ROOT = Path(__file__).resolve().parents[1]
PLANNER_ROOT = GUI_ROOT.parent / "isr_mission_planning"
OUTPUT = GUI_ROOT / "public" / "recorded" / "mission-evidence.json"
SEEDS = (42, 101, 2026)
SCALES = ("small", "medium", "large")


def read(path: Path):
    if not path.is_file():
        raise SystemExit(
            f"Missing evidence input: {path}\n"
            "The committed GUI fixture works without regeneration. To refresh it, "
            "follow README.md: Refresh measured evidence."
        )
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def compact_plan(plan: dict) -> dict:
    metadata = plan.get("metadata", {})
    plan["metadata"] = {
        key: metadata[key]
        for key in (
            "assignment_backend", "assignment_repairs", "sequencing_backend", "sdk_backend",
            "hardware_execution", "number_of_pbits", "number_of_samples", "requested_seed",
            "seed_applied", "seed_note", "full_sweeps", "n_replicas",
            "probabilistic_candidate_generated", "greedy_fallback_used",
            "route_aware_moves", "route_aware_swaps", "route_refined_makespan",
            "greedy_fallback_makespan",
        )
        if key in metadata
    }
    return plan


def main() -> None:
    scales: dict[str, dict] = {}
    for scale in SCALES:
        benchmark_rows = read(PLANNER_ROOT / "outputs" / "benchmark" / "gui" / f"{scale}_benchmark.json")
        benchmark = {(row["scenario"], row["solver"]): row for row in benchmark_rows}
        instances = []
        for seed in SEEDS:
            scenario_id = f"{scale}_seed_{seed}"
            instances.append({
                "seed": seed,
                "scenario": read(PLANNER_ROOT / "data" / "scenarios" / scale / f"{scenario_id}.json"),
                "plan": compact_plan(read(PLANNER_ROOT / "outputs" / "plans" / "gui" / f"{scenario_id}_orbit_hybrid_plan.json")),
                "validation": read(PLANNER_ROOT / "outputs" / "plans" / "gui" / f"{scenario_id}_orbit_hybrid_validation.json"),
                "benchmarks": {
                    "greedy": benchmark[(scenario_id, "greedy")],
                    "orbit_hybrid": benchmark[(scenario_id, "orbit_hybrid")],
                },
            })
        scales[scale] = {"label": scale.title(), "instances": instances}

    fixture = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "evidence_note": (
            "Synthetic recorded evidence from the local ORBIT software simulator and deterministic "
            "post-processing. All saved plans were independently validated. This is not hardware evidence."
        ),
        "scales": scales,
        "pdit": {
            **read(PLANNER_ROOT / "outputs" / "benchmark" / "pdit" / "small_seed_42_pbit_pdit_comparison.json"),
            "formulation_version": "2.0",
            "evidence_status": "historical pre-2.1 formulation result",
        },
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT.open("w", encoding="utf-8") as handle:
        json.dump(fixture, handle, indent=2, sort_keys=True)
        handle.write("\n")
    print(OUTPUT)


if __name__ == "__main__":
    main()
