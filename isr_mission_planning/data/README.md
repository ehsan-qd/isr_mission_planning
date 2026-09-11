# Scenario data and hardware exports

`scenarios/{small,medium,large}/` contains nine synthetic JSON scenarios: each
scale has seeds 42, 101, and 2026. These are committed inputs used by the CLI,
notebooks, benchmarks, and recorded GUI evidence.

From `isr_mission_planning/`, generate an additional scenario with:

```bash
uv run --locked isr-mission-planning generate --scale small --seed 123
```

Generation writes to `data/scenarios/small/small_seed_123.json`. The benchmark
command processes all JSON scenarios in the requested scale folder. The GUI
exporter specifically expects the three original seeds.

`q_matrices/` contains intentional hardware export artifacts (approximately
101 MB in total), including full symmetric Matrix Market files, variable mappings,
manifests, and copies of source scenarios. See its [format README](q_matrices/README.md)
before importing or regenerating them. The largest individual file is below
GitHub's standard 100 MB file limit.
