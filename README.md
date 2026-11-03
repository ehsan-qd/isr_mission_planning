# ISR Mission Planning

Synthetic UAV mission planning, recorded solver evidence, and an interactive communications-loss simulation. This repository contains two independently runnable projects:

| Project | What it does | Setup |
| --- | --- | --- |
| [isr_gui](isr_gui/README.md) | Next.js evidence showcase, presentation, and **Loss of Signal** game | Node.js 22.6+ and npm |
| [isr_mission_planning](isr_mission_planning/README.md) | Python scenario generation, greedy/ORBIT solvers, validation, benchmarks, and QUBO export | Python 3.10+; 3.12 recommended |

## Run the demo

After cloning this repository, open a terminal in its root:

```bash
cd isr_gui
npm ci
npm run dev
```

Open <http://localhost:3000> (showcase), <http://localhost:3000/presentation> (briefing), or <http://localhost:3000/game> (game). Recorded evidence and visual assets are included. No Python service, ORBIT installation, API key, or environment file is needed. Dependency installation and the build require internet access; Next.js downloads Google Fonts during the build.

For a production build, run `npm run build`, then `npm start` from `isr_gui`.

## Deploy the demonstrator on Vercel

Import `ehsan-qd/isr_mission_planning` into Vercel and set the project's **Root
Directory to the repository root (`.`)**, not `isr_gui`. If the project previously
used `isr_gui` as its root, clear that setting before redeploying. Leave the
project-level framework and build overrides unset: the root `vercel.json` selects
Next.js for the `isr_gui` service.

The GUI pins Node.js to major version 22, matching `.nvmrc` and CI. Its Next.js
configuration leaves output packaging to Vercel's adapter. Do not enable
`output: "standalone"` for this deployment: with Next.js 16.3 adapter builds it
tries to copy a `next-server.js.nft.json` file that the adapter build does not emit.
Local production serving still uses `npm run build` followed by `npm start`.

This uses Vercel's services configuration with one deployed service:

| Service | Directory | Public routing | Bindings |
| --- | --- | --- | --- |
| `isr_gui` | `isr_gui/` | All paths through the `/(.*)` rewrite | None |

The Python planner remains a local CLI and is not deployed as an HTTP service.
The GUI reads its bundled recorded evidence; it needs no backend URL, service
binding or environment variable. The rewrite preserves existing paths, including
`/demonstrator`, `/presentation`, `/game`, `/recorded/*` and `/_next/*`.

After deployment, share `https://<your-production-domain>/demonstrator`. Set the
Vercel project's deployment protection to match the intended audience. The route
configuration sends traffic to the GUI; it does not override project access rules.

Test the same service routing locally from the repository root:

```bash
npx vercel@65.10.0 dev --local --listen 127.0.0.1:3012
```

Open <http://127.0.0.1:3012/demonstrator>. Stop an existing `next dev` process for
this checkout before starting this command, because Next.js allows one development
server per build directory. Use Ctrl-C to stop the Vercel development server.
Local mode does not require linking a Vercel account. For a linked project's
environment settings, use `vercel dev` without `--local`.

Configuration reference: [Vercel Services](https://vercel.com/docs/services).

## Run the planner

Install [uv](https://docs.astral.sh/uv/getting-started/installation/), then from the repository root:

```bash
cd isr_mission_planning
uv sync --locked --extra dev
uv run --locked isr-mission-planning solve --scenario data/scenarios/small/small_seed_42.json --solver greedy
uv run --locked pytest
```

The solve command saves a plan and validation report in `outputs/plans/`, and map/Gantt images in `outputs/figures/`. The greedy baseline runs without ORBIT. Optional ORBIT installation and a standard `pip` alternative are in the [planner README](isr_mission_planning/README.md).

## Repository guide

- [Planner architecture and commands](isr_mission_planning/README.md)
- [GUI controls and evidence refresh](isr_gui/README.md)
- [Scenario data](isr_mission_planning/data/README.md)
- [Performance notebooks](isr_mission_planning/notebooks/README.md)
- [Hardware QUBO format](isr_mission_planning/data/q_matrices/README.md)
- [Recorded GUI fixture](isr_gui/public/recorded/README.md)
- [Development and checks](CONTRIBUTING.md)

Generated run outputs, dependencies, local settings, and build caches are ignored by Git. Saved scenarios, the recorded GUI fixture, and hardware matrix exports are intentional repository content.

## Evidence and scope

All scenarios are synthetic demonstrations. Recorded ORBIT evidence is from a software simulator, not hardware. ORBIT SDK 0.0.2 does not apply the requested sampler seed. Spatial conflicts in the planner are reported after solving, not prevented by optimisation. The browser game's comparator is a local heuristic, not ORBIT. This is not flight-control software.

No license has been selected for this repository. Included Quantum Dice branding does not imply a grant of trademark or asset reuse rights.
