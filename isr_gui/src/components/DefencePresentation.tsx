"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AmbientNetwork } from "./AmbientNetwork";
import { AnimatedUAVMap } from "./AnimatedUAVMap";
import { BrandMark } from "./BrandMark";
import { FullscreenButton } from "./FullscreenButton";
import { MissionGantt } from "./MissionGantt";
import { MissionMap } from "./MissionMap";
import type { Evidence, Scale } from "@/lib/types";

const slides = ["Mission brief", "The problem", "How we solved it", "Explore the solution", "UAV playback", "Evidence", "Operationalise"];
const scaleOrder: Scale[] = ["small", "medium", "large"];
const fmt = (value: number, digits = 1) => value.toFixed(digits);
const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;

function ScaleSelector({ value, onChange }: { value: Scale; onChange: (scale: Scale) => void }) {
  return <div className="brief-scale-selector" aria-label="Problem size">{scaleOrder.map((scale) => <button key={scale} aria-pressed={value === scale} onClick={() => onChange(scale)}>{scale}</button>)}</div>;
}

export function DefencePresentation() {
  const [evidence, setEvidence] = useState<Evidence | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [slide, setSlide] = useState(0);
  const [solutionScale, setSolutionScale] = useState<Scale>("large");
  const [replayScale, setReplayScale] = useState<Scale>("medium");
  const [selectedUav, setSelectedUav] = useState("");

  useEffect(() => {
    fetch("/recorded/mission-evidence.json")
      .then((response) => {
        if (!response.ok) throw new Error("Recorded mission evidence could not be loaded");
        return response.json();
      })
      .then(setEvidence)
      .catch((caught: Error) => setError(caught.message));
  }, []);

  const navigate = useCallback((next: number) => {
    if (next >= 0 && next < slides.length) setSlide(next);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const controlFocused = event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement;
      if (["ArrowRight", "ArrowDown", " "].includes(event.key) && !controlFocused) { event.preventDefault(); navigate(slide + 1); }
      if (["ArrowLeft", "ArrowUp"].includes(event.key) && !controlFocused) { event.preventDefault(); navigate(slide - 1); }
      if (event.key.toLowerCase() === "r") setSlide(0);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate, slide]);

  const solution = evidence?.scales[solutionScale].instances.find((item) => item.seed === 42) ?? evidence?.scales[solutionScale].instances[0];
  const replay = evidence?.scales[replayScale].instances.find((item) => item.seed === 42) ?? evidence?.scales[replayScale].instances[0];
  const activeUavs = useMemo(() => replay?.plan.uav_routes.filter((route) => route.scheduled_tasks.length > 0) ?? [], [replay]);
  const effectiveUav = activeUavs.some((route) => route.uav_id === selectedUav) ? selectedUav : activeUavs[0]?.uav_id ?? "";

  const evidenceRows = useMemo(() => {
    if (!evidence) return [];
    return scaleOrder.map((scale) => {
      const instances = evidence.scales[scale].instances;
      const greedyMakespan = mean(instances.map((item) => item.benchmarks.greedy.makespan));
      const hybridMakespan = mean(instances.map((item) => item.benchmarks.orbit_hybrid.makespan));
      const greedyDistance = mean(instances.map((item) => item.benchmarks.greedy.total_distance));
      const hybridDistance = mean(instances.map((item) => item.benchmarks.orbit_hybrid.total_distance));
      return { scale, tasks: instances[0].scenario.tasks.length, uavs: instances[0].scenario.uavs.length, makespan: (hybridMakespan / greedyMakespan - 1) * 100, distance: (hybridDistance / greedyDistance - 1) * 100 };
    });
  }, [evidence]);

  if (error) return <main className="fatal"><div><div className="eyebrow">Briefing unavailable</div><h1>{error}</h1></div></main>;
  if (!evidence || !solution || !replay || !effectiveUav) return <main className="showcase-shell"><AmbientNetwork/><div className="loading"><div className="loading-orbit"/><div className="eyebrow">Loading briefing evidence</div></div></main>;

  const selectedRoute = replay.plan.uav_routes.find((route) => route.uav_id === effectiveUav)!;
  const maximumVariables = Math.max(...evidence.scales.large.instances.map((item) => Number(item.plan.metadata.number_of_pbits ?? 0)));

  return <main className="showcase-shell defence-brief visual-brief" data-slide={slide}>
    <AmbientNetwork/>
    <header className="topbar">
      <div className="brand"><BrandMark/><div><strong>ORBIT ISR Mission Planning</strong><span>Defence capability briefing</span></div></div>
      <nav className="progress" aria-label="Briefing progress">{slides.map((label, index) => <button key={label} className={index === slide ? "active" : index < slide ? "complete" : ""} aria-current={index === slide ? "step" : undefined} aria-label={`Go to ${index + 1}. ${label}`} onClick={() => navigate(index)}><span/></button>)}</nav>
      <div className="top-actions"><Link className="view-link" href="/game">Play Loss of Signal</Link><Link className="view-link" href="/">Interactive showcase</Link><FullscreenButton/><span className="replay"><i/>RECORDED EVIDENCE</span></div>
    </header>

    <section className="frame brief-frame" key={slide}>
      {slide === 0 && <div className="slide title-slide brief-title">
        <div className="eyebrow">Multi-UAV ISR mission planning</div><h1>Mission intent.<br/>Validated routes.</h1>
        <div className="brief-strip"><span>Define</span><i>→</i><span>Optimise</span><i>→</i><span>Validate</span><i>→</i><span>Re-plan</span></div>
        <button className="button primary hero-button" onClick={() => navigate(1)}>Begin briefing <span>→</span></button>
      </div>}

      {slide === 1 && <div className="slide visual-slide">
        <div className="eyebrow">01 · The problem</div><h2>Who should collect what—<br/>in which order?</h2>
        <div className="problem-visual"><div><b>MTE</b><strong>Mission Task Elements</strong><span>location · sensor · duration</span></div><i>+</i><div><b>UAV</b><strong>Heterogeneous fleet</strong><span>base · payload · speed</span></div><i>→</i><div className="accent"><b>PLAN</b><strong>Assign + sequence</strong><span>complete sooner · return home</span></div></div>
        <div className="difficulty-strip"><div><strong>{maximumVariables.toLocaleString()}</strong><span>coupled assignment variables</span></div><span>300 MTEs</span><span>40 UAVs</span><span>Exactly once</span><span>Sensor compatible</span></div>
      </div>}

      {slide === 2 && <div className="slide visual-slide">
        <div className="eyebrow">02 · How we solved it</div><h2>Probabilistic assignment.<br/>Deterministic completion.</h2>
        <div className="large-formula"><strong>Σ<sub>u∈eligible(t)</sub> x<sub>u,t</sub> = 1</strong><span>one sensor-capable UAV per MTE</span></div>
        <div className="visual-pipeline">{[["01", "Encode"], ["02", "ORBIT sample"], ["03", "Repair"], ["04", "Route"], ["05", "Validate"]].map(([number, label], index) => <div key={number}><small>{number}</small><strong>{label}</strong>{index < 4 && <i>→</i>}</div>)}</div>
        <div className="lesson-banner"><span>UAV-14 lesson</span><strong>Balance route time—not MTE count.</strong><em>Critical-route refinement + greedy safety fallback</em></div>
      </div>}

      {slide === 3 && <div className="slide solution-explorer">
        <header className="compact-heading"><div><div className="eyebrow">03 · Explore the solution</div><h2>Routes and schedule.</h2></div><ScaleSelector value={solutionScale} onChange={setSolutionScale}/></header>
        <div className="combined-solution"><div className="panel combined-map"><MissionMap scenario={solution.scenario} plan={solution.plan}/></div><div className="combined-side"><div className="solution-numbers"><span><b>{solution.scenario.tasks.length}</b>MTEs</span><span><b>{solution.scenario.uavs.length}</b>UAVs</span><span><b>{fmt(solution.plan.mission_end_time)}</b>min</span></div><div className="panel combined-gantt"><div className="panel-kicker">Aircraft schedule · seed 42</div><MissionGantt plan={solution.plan}/></div></div></div>
      </div>}

      {slide === 4 && <div className="slide replay-slide">
        <header className="compact-heading replay-heading"><div><div className="eyebrow">04 · UAV movement in time</div><h2>Follow one aircraft.</h2></div><div className="replay-selectors"><ScaleSelector value={replayScale} onChange={(scale) => { setReplayScale(scale); setSelectedUav(""); }}/><label className="tactical-select"><span>Aircraft</span><select aria-label="Aircraft" value={effectiveUav} onChange={(event) => setSelectedUav(event.target.value)}>{activeUavs.map((route) => <option key={route.uav_id}>{route.uav_id}</option>)}</select></label></div></header>
        <div className="replay-layout"><AnimatedUAVMap key={`${replay.scenario.scenario_id}-${effectiveUav}`} scenario={replay.scenario} plan={replay.plan} selectedUav={effectiveUav}/><aside className="flight-facts"><span>Selected</span><strong>{effectiveUav}</strong><div><b>{selectedRoute.scheduled_tasks.length}</b><small>MTEs</small></div><div><b>{fmt(selectedRoute.return_time)}</b><small>minutes</small></div><p>Other routes are muted.<br/>Drag the timeline to inspect the mission.</p></aside></div>
      </div>}

      {slide === 5 && <div className="slide visual-slide">
        <div className="eyebrow">05 · Recorded evidence</div><h2>Three sizes.<br/>Nine feasible plans.</h2>
        <div className="evidence-cards">{evidenceRows.map((row) => <article key={row.scale}><span>{row.scale}</span><strong>{row.tasks} <i>MTEs</i></strong><small>{row.uavs} UAVs</small><div><b>{fmt(row.makespan)}%</b><em>mean makespan</em></div><div><b>{fmt(row.distance)}%</b><em>mean distance</em></div></article>)}</div>
        <div className="evidence-foot"><strong>100% independently feasible</strong><span>Validated hybrid pipeline · three generated scenarios per size · versus greedy baseline</span></div>
      </div>}

      {slide === 6 && <div className="slide visual-slide">
        <div className="eyebrow">06 · From demonstrator to operations</div><h2>Connect. Constrain. Assure.</h2>
        <div className="operational-steps"><div><small>01</small><strong>Connect</strong><span>C2 tasking</span><span>Approved terrain</span><span>Weather + comms</span></div><div><small>02</small><strong>Constrain</strong><span>Endurance + reserve</span><span>Airspace + separation</span><span>Threat + timing</span></div><div className="accent"><small>03</small><strong>Assure</strong><span>Human approval</span><span>Dynamic re-planning</span><span>Representative trials</span></div></div>
        <div className="next-trial"><span>Next trial</span><strong>Inject a new MTE, UAV loss and weather closure.</strong><em>Measure decision time · constraint breaches · operator interventions</em></div>
        <div className="cta-row"><Link className="button" href="/">Interactive evidence</Link><button className="button primary" onClick={() => setSlide(0)}>Restart</button></div>
      </div>}

    </section>

    <footer className="footer"><button disabled={slide === 0} onClick={() => navigate(slide - 1)}>← Previous</button><div><strong>{String(slide + 1).padStart(2, "0")}</strong><span>/</span><span>{String(slides.length).padStart(2, "0")}</span><em>{slides[slide]}</em></div><button disabled={slide === slides.length - 1} onClick={() => navigate(slide + 1)}>Next →</button></footer>
  </main>;
}
