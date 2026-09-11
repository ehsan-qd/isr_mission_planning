# ISR Mission Planning

A reproducible scaffold for a simplified heterogeneous-UAV ISR mission-planning problem, solved
with ORBIT. It models task assignment, scheduling, routing, sensor compatibility, and post-solution
spatial deconfliction. Every atomic task is assigned to exactly one suitably equipped UAV; UAVs may
chain tasks before returning to their home base. The objective is mission makespan (the last
home-base return).

Scenario modelling, QUBO encoding, backend execution, decoding, independent validation, and metrics
are deliberately kept as separate layers. The ORBIT package defines an explicit integration boundary
and backend-neutral intermediate representation, and contains no invented SDK calls or hardware
claims.

## Quick start

Run these commands from `isr_mission_planning/`. Python 3.10 or newer is supported;
Python 3.12 is selected by the committed `.python-version` for uv users.

```bash
uv sync --locked --extra dev
uv run --locked pytest
uv run --locked isr-mission-planning solve --scenario data/scenarios/small/small_seed_42.json --solver greedy
```

No ORBIT package is needed for the baseline, model encoders, or hardware exports.
Three native integration tests skip without ORBIT. Output paths are relative to your
working directory. See the [root README](../README.md) for the browser demo.

Alternatively, use standard Python packaging (dependency ranges, rather than `uv.lock`):

```bash
python -m venv .venv
source .venv/bin/activate
python -m pip install -e '.[dev]'
pytest
python -m isr_mission_planning solve --scenario data/scenarios/small/small_seed_42.json --solver greedy
```

On Windows PowerShell, activate with `.venv\Scripts\Activate.ps1` instead.

## ORBIT setup

The SDK and simulator are optional external dependencies and are not bundled. The
recorded results used SDK 0.0.2 and simulator 0.9.0. Obtain compatible source
checkouts from their maintainer, then install them into the project environment
(replace these example paths with your actual checkout paths):

```bash
uv sync --locked --extra dev
uv pip install --python .venv/bin/python -e /path/to/orbit -e /path/to/orbit-sdk-main
```

On Windows use `.venv/Scripts/python.exe` as the Python path. The core lockfile
intentionally excludes these externally supplied packages. After installing them,
use `uv run --no-sync` for ORBIT commands so uv does not remove the extra packages.
There are no required sibling checkout locations.

Solve the committed small scenario with the `orbit_hybrid` solver — ORBIT's simulator sampling a
geography-aware assignment QUBO (`assignment_geographic_v2`), followed by deterministic
feasible-neighbourhood local search, route-aware makespan refinement, nearest-neighbour sequencing,
and a greedy makespan safety fallback:

```bash
uv run --no-sync python -m isr_mission_planning solve \
  --scenario data/scenarios/small/small_seed_42.json \
  --solver orbit_hybrid
```

This writes the solver result, plan, and independent validation report under `outputs/plans/`, plus
a mission map and Gantt chart under `outputs/figures/`. QUBO constraint violations, if any, are
repaired during decoding and counted in plan metadata.

ORBIT SDK 0.0.2 hard-codes the simulator seed to `None` internally rather than exposing it through
`SolverParams`. Results record this limitation as `seed_applied: false`; deterministic preprocessing
and decoding do not make the stochastic SDK execution reproducible.

## Notebook: solving with ORBIT and measuring performance

[notebooks/orbit_solve_and_performance.ipynb](notebooks/orbit_solve_and_performance.ipynb) runs the
small (seed 42) scenario through `orbit_hybrid`, reports timing and energy attribution, checks the
result against an independently *proven* exact optimum (SciPy/HiGHS MILP), characterises raw-ORBIT
sampling reliability across repeated runs (ground-state hit rate with a 95% confidence interval),
and compares against the classical `greedy` baseline.

```bash
uv run --no-sync jupyter nbconvert --to notebook --execute --inplace notebooks/orbit_solve_and_performance.ipynb
```

If Jupyter or VS Code is using a different Python kernel, register the project environment once and
select **ISR Mission Planning (.venv)** in the notebook kernel menu:

```bash
uv run --no-sync python -m ipykernel install --user \
  --name isr-mission-planning \
  --display-name "ISR Mission Planning (.venv)"
```

The QUBO covers task assignment through a load-balancing surrogate; sequencing and timing remain
deterministic classical post-processing. The notebook's results must not be read as proof of a
globally optimal mission schedule, only that the assignment sub-problem reaches a proven optimum.

## p-Dit assignment experiment

The p-bit formulation above represents each task's assignment with several one-hot binary
variables (one per sensor-eligible UAV) plus an exactly-one *penalty* term. `orbit_pdit`
represents each task with a single **categorical p-dit** whose states are its eligible UAVs — the
exactly-one property is guaranteed by the domain itself, not learned by the sampler.

Native categorical execution **is** genuinely supported by the locally installed ORBIT SDK, via
`orbit_sdk.problems.MIQPProblem`'s auto-detected "PDIT groups" and the simulator's joint
categorical (softmax) sampling — confirmed by reading the simulator's own Monte Carlo update code,
not assumed from naming. A real gap in the installed SDK's beta `MIQPProblem` construction path
(`model_post_init` never populates the network adjacency the simulator needs) is worked around
using the SDK's own public graph utilities; `orbit_sdk` itself is not modified, and no fallback to
a one-hot QUBO occurs. Tasks with only one sensor-eligible UAV are not registered as genuine
multi-state PDIT groups by this SDK version (minimum group size is 2) and fall back to an ordinary
penalty constraint instead — documented and handled explicitly rather than hidden.

```bash
uv run --no-sync python -m isr_mission_planning solve \
  --scenario data/scenarios/small/small_seed_42.json \
  --solver orbit_pdit
```

[notebooks/orbit_pdit_solve_and_performance.ipynb](notebooks/orbit_pdit_solve_and_performance.ipynb)
mirrors the p-bit notebook section-by-section: SDK capability inspection, the categorical model
(with an independent energy auditor proven mathematically equivalent to the V2 p-bit objective
across 100+ valid assignments), an exact categorical optimum, a native raw-sampling reliability
study, and a direct p-bit-vs-p-dit comparison. In the executed run: raw p-dit sampling reached
**83x** higher state diversity and its best-of-5-runs sample hit the *proven* exact optimum in
**5/5** runs, versus **0/5** for raw p-bit sampling — at roughly 10x the per-run wall-clock cost in
this local simulator. See the notebook for full numbers and the automatically-selected
interpretation.

## Other workflows

```bash
python -m isr_mission_planning generate --scale small --seed 42
python -m isr_mission_planning validate \
  --scenario data/scenarios/small/small_seed_42.json \
  --plan outputs/plans/small_seed_42_orbit_hybrid_plan.json
python -m isr_mission_planning benchmark --scale small --solvers greedy orbit_hybrid
```

## Current capabilities

- Typed, JSON-serialisable scenario, plan, trajectory, result, metric, and conflict models.
- Structured deterministic generation at small, medium, and large scales with clustered/dispersed
  targets, heterogeneous payloads and speeds, scarce SAR, priority clusters, and multiple bases.
- `greedy` classical baseline and `orbit` / `orbit_hybrid` / `orbit_pdit` ORBIT-backed solvers
  behind a common solver protocol — one-hot p-bit QUBO and native categorical p-dit (MIQP)
  representations of the same assignment objective.
- Bounded, non-negative geographic dispersion costs avoid quadratic task-pile-up rewards;
  route-aware critical-path moves and a greedy fallback prevent the hybrid from returning a worse
  makespan than the available feasible baseline.
- Independent checks for task coverage, duplicates, payload eligibility, timing, travel, return,
  optional deadlines/endurance, and spatial conflicts.
- Exact closest-approach calculation for simultaneous straight-line trajectory segments.
- Independent QUBO/categorical energy auditing and exact MILP ground-state reference solvers for
  both representations.
- JSON/CSV benchmarks and static map/Gantt outputs.

## Pilot roadmap

- **Pilot 1:** small-scale static mission planning (4–6 UAVs, 12–20 tasks).
- **Pilot 1.1:** medium-scale mission planning (10–20 UAVs, 50–100 tasks).
- **Pilot 1.2:** large-scale mission planning (30–50+ UAVs, 200–500+ tasks).
- **Future:** dynamic retasking, richer operational constraints, and deconfliction inside
  optimisation.

## Why ORBIT

The project investigates probabilistic optimisation for combinatorial assignment and sequencing
decisions in ISR mission planning. Its benchmark infrastructure measures solution quality, end-to-end
time-to-solution, scaling, and feasibility rate, and can evaluate potential hardware speedup only
when formulations and timing definitions are genuinely comparable. It makes no assumption of
probabilistic or quantum advantage.

## Scope

This is not a UAV flight-control system or a complete operational ISR planner. Pilot 1 excludes
terrain, communications, recharge, detailed endurance, storage, threats, obstacles, no-fly zones,
failures, and dynamic retasking. Spatial separation is detected after solving and is reported as a
warning; it is not yet an optimisation constraint.

## Hardware Q matrix export

The nine saved scenarios are exported in [data/q_matrices](data/q_matrices/README.md)
as full symmetric Matrix Market coordinate QUBOs, matching the supplied hardware
file format and preserving the hybrid solver's V2 energy. Filenames include scale,
scenario seed and formulation. Sidecars retain variable order, parameters and
scenario hashes for decoding and benchmarking returned hardware samples.

```bash
python -m isr_mission_planning export-qubos
```

See the folder README for the binary energy convention and the sample/timing
information to retain with hardware results.
