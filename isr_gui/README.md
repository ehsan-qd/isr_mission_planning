# ORBIT ISR Mission Planning GUI

A six-screen, presentation-first Next.js client for the measured small, medium, and large ISR mission-planning results in `../isr_mission_planning`. Its layout, navigation, visual tokens, evidence boundary, and recorded-data workflow mirror the probabilistic digital-twin GUI.

## Start

Run from `isr_gui/` with Node.js 22.6+ (Node 22 recommended) and npm. No backend,
API keys, or environment file is required. Use `npm run build` then `npm start`
for production; builds download Google Fonts and require internet access.

```bash
npm ci
npm run dev
```

Open <http://localhost:3000> for the interactive evidence showcase or
<http://localhost:3000/presentation> for the seven-slide defence capability briefing. The briefing
includes a selectable full-solution map/schedule and time-based playback for any active UAV, with
the other routes visually muted. Use `←` / `→`
(or space) to move between slides and `R` to reset. The interactive showcase also supports `T`
to toggle executive/technical detail. Both pages provide a **Full screen** control in the top bar;
use the same control or `Esc` to exit.

The UI uses **Mission Task Element (MTE)** for the indivisible planning unit: one collection action
at a location with a required sensor and service duration, assigned to exactly one eligible UAV.

## Refresh measured evidence

The checked-in `public/recorded/mission-evidence.json` is sufficient for startup.
Do **not** run `sync:recorded` during normal setup: it consumes generated outputs
that are intentionally ignored by Git. Python is only needed to refresh evidence.

To refresh the small/medium/large evidence, first install the optional ORBIT
packages using the [planner instructions](../isr_mission_planning/README.md#orbit-setup).
From `isr_mission_planning/`, run the following in Bash/zsh:

```bash
for scale in small medium large; do
  uv run --no-sync python -m isr_mission_planning benchmark --scale "$scale" --solvers greedy orbit_hybrid --output-dir outputs/benchmark/gui
  for seed in 42 101 2026; do
    uv run --no-sync python -m isr_mission_planning solve --scenario "data/scenarios/$scale/${scale}_seed_${seed}.json" --solver orbit_hybrid --output-dir outputs/plans/gui --figure-dir outputs/figures/gui
  done
done
```

The exporter also requires
`outputs/benchmark/pdit/small_seed_42_pbit_pdit_comparison.json`, produced by the
p-dit notebook's persisted-output cells. The currently recorded comparison is
historical formulation 2.0 evidence; the exporter labels it as such. Do not replace
it with a new formulation's result without also updating the exporter's version
and evidence-status labels and checking the GUI interpretation.

Once all inputs are available, run `npm run sync:recorded` from `isr_gui/` and
review the fixture diff. Benchmark rows and displayed plans come from separate
stochastic solves, so their makespans need not be identical.

## Map surface

The 2D mission map uses `public/assets/battlelab-terrain-v1.png`, a synthetic, non-operational
terrain asset generated for this presentation. Its navy/signal-yellow palette, coastal context,
layered-map motif, and topology cues are inspired by the British Army's public Defence BattleLab
page and brochure. It does not reproduce the real site, Army/MOD marks, or operational geography.

## Evidence boundary

All material is synthetic recorded demonstration evidence. ORBIT results come from the locally installed software simulator; the SDK does not apply the requested random seed internally. The GUI reports measured trade-offs and does not claim universal solver or hardware superiority. Spatial conflicts are post-solution warnings and are not currently optimisation constraints.

## Loss of Signal — `/game`

Run `npm run dev` and open `http://localhost:3000/game`. This replaces the original assignment puzzle with the **Cold Smoke** call-out from the supplied Loss of Signal design.

### Playing

- Select an aircraft, then map contacts to build its sortie. Use the route arrows to reorder, or right-click a map contact to remove it from the selected aircraft.
- Green links accept orders immediately. Amber commands take 12 simulated seconds and remain queued through a blackout. Red aircraft cannot be retasked and display their last reported position and route.
- Choose **Continue**, **Hold position**, or **Climb for link** before going dark. Automatic return on bingo fuel overrides all three.
- HELIOS can orbit a chosen relay point. Coverage appears after it reaches the station and connects to the mast. The saddle is a useful starting point. Placing a relay previews coverage for KESTREL–1; otherwise the overlay uses the selected sensing aircraft.
- Low and mid altitude use normal endurance and dwell. High altitude improves terrain clearance but consumes 20% more endurance and makes sensor dwell 2.5 times longer. It does not eliminate radio range limits.
- Dark observations remain aboard until radio reconnection or landing. Lost aircraft lose untransmitted reports. Recovered tracks flash across the map when uploaded.
- Recall aircraft early enough to land before 15:00. The route estimate shows whether a route returns before closure, and relay sorties show their latest departure time. Individual return-window warnings precede the general recovery phase.
- `Space` toggles plan/run, `C` toggles coverage, `P` sequences the selected route, `Shift-P` previews a full local-planner proposal, and `Escape` pauses. Normal Tab keyboard navigation is preserved.
- Optional synthesized radio cues start only after clicking **Radio on**. The mission auto-pauses on decision events; the eight-second signal warning automatically resumes unless the player stays in planning.

### Simulation and comparison

The fixed 10 Hz reducer lives in `src/lib/game.ts`. One grid unit is 100 m. A 64×64 authored elevation field feeds grid-sampled line-of-sight tests; a breadth-first relay graph determines link quality. Smoke position, the late beacon, deadlines, aircraft motion and endurance are deterministic. Fixed seed 41 identifies the authored scenario; this version does not generate random maps.

The comparator is **not the real ORBIT solver**. It uses sensor/deadline/fuel-aware greedy insertion; selected-route sequencing uses nearest neighbour and 2-opt. The debrief runs its dispatch-only plan through the same simulator as the player. The optimistic forecast assumes uncertain contacts contain three people and all information and aircraft return. No comparator score is hard-coded. Scoring is 60 per person, 30 per false contact cleared, up to 10 fuel-margin points per landed aircraft, and −120 per lost aircraft.

### Delivered scope

This implements the design's browser-only V1 plus interactive relay coverage/placement and telemetry timeline scrubbing. There is one authored mission, four airframes, three contingency cards, forecast smoke, a timed distress call, medkit delivery, return-window warnings, recovered telemetry and a per-contact debrief. Aircraft altitude and route motion are simplified; the drawn fire edge is atmospheric, with authored deadline clocks controlling contact failure. The replay shows the information operations had at each time, including last-known positions during blackouts.

Campaign progression, persistent hangars, procedural maps, ground relay dropboxes, the other three contingency cards, branching replay, modifiers and live solver integration remain the later expansion stages in the supplied design. This version does not save campaign or mission progress.

### Validation

`npm run test:game` uses Node.js 22.6+ TypeScript stripping. Tests cover terrain/relay geometry, delayed and rejected orders, hidden telemetry and data loss, contingency behaviour, fuel priority, payloads, timed interrupts, deterministic replay, altitude trade-offs, and a complete adaptive mission with all 13 people accounted for and all aircraft home. Run `npm run build` for production type/build validation.
