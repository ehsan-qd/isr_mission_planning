"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Evidence, MissionInstance, Scale } from "@/lib/types";
import { AmbientNetwork } from "./AmbientNetwork";
import { AnimatedUAVMap } from "./AnimatedUAVMap";
import { BrandMark } from "./BrandMark";
import { FullscreenButton } from "./FullscreenButton";
import { MissionGantt } from "./MissionGantt";
import { MissionMap } from "./MissionMap";

const slides = ["The mission", "The instance", "The method", "The plan", "Across seeds", "Capability demonstrated", "QUBO appendix", "Questions"];
const scaleOptions: Scale[] = ["small", "medium", "large"];

const fmt = (value: number, digits = 1) => value.toFixed(digits);
const pct = (value: number) => `${Math.round(value * 100)}%`;
const delta = (a: number, b: number) => (a / b - 1) * 100;

function Metric({ label, value, note }: { label: string; value: string; note?: string }) {
  return <div className="metric"><span>{label}</span><strong>{value}</strong>{note && <small>{note}</small>}</div>;
}

function Pipeline() {
  return <div className="pipeline">{[
    ["01", "Encode", "Sensor-eligible UAV × MTE assignment"],
    ["02", "Sample", "ORBIT software simulator explores the QUBO"],
    ["03", "Repair", "Deterministic feasible-neighbourhood search"],
    ["04", "Sequence", "Nearest-neighbour routes and timing"],
    ["05", "Validate", "Independent coverage, travel and conflict checks"],
  ].map(([n,title,text])=><div key={n}><small>{n}</small><strong>{title}</strong><span>{text}</span></div>)}</div>;
}

function SeedTable({ instances }: { instances: MissionInstance[] }) {
  return <div className="seed-table"><div className="seed-head"><span>Seed</span><span>Greedy</span><span>Hybrid pipeline</span><span>Distance Δ</span><span>Outcome</span></div>{instances.map((item) => {
    const greedy = item.benchmarks.greedy;
    const orbit = item.benchmarks.orbit_hybrid;
    const makespanDelta = delta(orbit.makespan, greedy.makespan);
    const distanceDelta = delta(orbit.total_distance, greedy.total_distance);
    const fallbackUsed = Boolean(item.plan.metadata.greedy_fallback_used);
    const outcome = fallbackUsed ? "Greedy safety fallback" : makespanDelta < 0 ? "Shorter makespan" : makespanDelta > 0 ? "Longer makespan" : "Same makespan";
    return <div className="seed-row" key={item.seed}><strong>{item.seed}</strong><span>{fmt(greedy.makespan)} min</span><span>{fmt(orbit.makespan)} min</span><span className={distanceDelta < 0 ? "lower" : "higher"}>{distanceDelta > 0 ? "+" : ""}{fmt(distanceDelta)}%</span><span className={makespanDelta <= 0 ? "lower" : "higher"}>{outcome}</span></div>;
  })}</div>;
}

export function MissionShowcase() {
  const [evidence, setEvidence] = useState<Evidence | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [slide, setSlide] = useState(0);
  const [scale, setScale] = useState<Scale>("large");
  const [seed, setSeed] = useState(42);
  const [selectedUav, setSelectedUav] = useState("");
  const [technical, setTechnical] = useState(false);

  useEffect(() => { fetch("/recorded/mission-evidence.json").then((r) => { if (!r.ok) throw new Error("Recorded evidence could not be loaded"); return r.json(); }).then(setEvidence).catch((caught: Error) => setError(caught.message)); }, []);
  const navigate = useCallback((next: number) => { if (next >= 0 && next < slides.length) setSlide(next); }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const controlFocused = event.target instanceof HTMLButtonElement || event.target instanceof HTMLSelectElement || event.target instanceof HTMLInputElement || event.target instanceof HTMLAnchorElement;
      if (["ArrowRight","ArrowDown"," "].includes(event.key) && !controlFocused) { event.preventDefault(); navigate(slide + 1); }
      if (["ArrowLeft","ArrowUp"].includes(event.key) && !controlFocused) { event.preventDefault(); navigate(slide - 1); }
      if (event.key.toLowerCase() === "r") { setSlide(0); setScale("large"); setSeed(42); setSelectedUav(""); }
      if (event.key.toLowerCase() === "t") setTechnical((value) => !value);
    };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, [navigate, slide]);

  const instances = useMemo(() => evidence?.scales[scale]?.instances ?? [], [evidence, scale]);
  const availableScales = useMemo(() => scaleOptions.filter((option) => evidence?.scales[option]?.instances.length), [evidence]);
  const instance = useMemo(() => instances.find((item) => item.seed === seed) ?? instances[0], [instances, seed]);
  const activeUavs = useMemo(() => instance?.plan.uav_routes.filter((route) => route.scheduled_tasks.length > 0) ?? [], [instance]);
  const effectiveUav = activeUavs.some((route) => route.uav_id === selectedUav) ? selectedUav : activeUavs[0]?.uav_id ?? "";
  const aggregate = useMemo(() => {
    if (!instances.length) return null;
    const mean = (key: "makespan"|"total_distance", solver: "greedy"|"orbit_hybrid") => instances.reduce((sum,item)=>sum+item.benchmarks[solver][key],0)/instances.length;
    return { makespan: delta(mean("makespan","orbit_hybrid"),mean("makespan","greedy")), distance: delta(mean("total_distance","orbit_hybrid"),mean("total_distance","greedy")) };
  }, [instances]);

  if (error) return <main className="fatal"><div><div className="eyebrow">Recorded showcase unavailable</div><h1>{error}</h1><p>Run <code>npm run sync:recorded</code> and reload.</p></div></main>;
  if (!evidence || !instance || !aggregate || !effectiveUav) return <main className="showcase-shell"><AmbientNetwork/><div className="loading"><div className="loading-orbit"/><div className="eyebrow">Loading measured mission evidence</div></div></main>;

  const orbit = instance.benchmarks.orbit_hybrid;
  const greedy = instance.benchmarks.greedy;
  const featuredScale: Scale = evidence.scales.large?.instances.length ? "large" : "medium";
  const maximumVariables = Math.max(...evidence.scales.large.instances.map((item) => Number(item.plan.metadata.number_of_pbits ?? 0)));
  const feasiblePlans = Object.values(evidence.scales).flatMap((entry) => entry.instances).filter((item) => item.validation.feasible).length;
  const totalPlans = Object.values(evidence.scales).flatMap((entry) => entry.instances).length;
  const avgUtilisation = Object.values(instance.validation.metrics.uav_utilisation).reduce((a,b)=>a+b,0) / Object.keys(instance.validation.metrics.uav_utilisation).length;

  return <main className="showcase-shell" data-slide={slide}>
    <AmbientNetwork/>
    <header className="topbar">
      <div className="brand"><BrandMark/><div><strong>ORBIT ISR Mission Planning</strong><span>Assign. Sequence. Validate.</span></div></div>
      <nav className="progress" aria-label="Demonstration progress">{slides.map((label,index)=><button key={label} className={index===slide?"active":index<slide?"complete":""} aria-current={index===slide?"step":undefined} aria-label={`Go to ${index+1}. ${label}`} onClick={()=>navigate(index)}><span/></button>)}</nav>
      <div className="top-actions"><Link className="view-link" href="/game">Play Loss of Signal</Link><Link className="view-link" href="/presentation">Capability briefing</Link><FullscreenButton/><span className="replay"><i/>RECORDED · SOFTWARE SIMULATOR</span><div className="segmented"><button aria-pressed={!technical} onClick={()=>setTechnical(false)}>Executive</button><button aria-pressed={technical} onClick={()=>setTechnical(true)}>Technical</button></div></div>
    </header>

    <section className="frame" key={`${slide}-${scale}-${seed}`}>
      {slide === 0 && <div className="slide title-slide"><div className="eyebrow">Probabilistic optimisation for ISR</div><h1>Turn collection demand<br/>into a flyable mission.</h1><p>Heterogeneous UAVs. Sensor-constrained Mission Task Elements. One plan that assigns every MTE, sequences every route, and returns every aircraft home.</p><div className="simple-flow">{[["01","Observe"],["02","Assign"],["03","Sequence"],["04","Validate"]].map(([n,t])=><div key={n}><small>{n}</small><strong>{t}</strong></div>)}</div><button className="button primary" onClick={()=>navigate(1)}>Show the mission <span>→</span></button></div>}

      {slide === 1 && <div className="slide"><header className="heading"><div><div className="eyebrow">1 · The instance</div><h2>One operating area.<br/>Many coupled decisions.</h2></div><div className="selectors"><div className="segmented">{availableScales.map((option)=><button key={option} aria-pressed={scale===option} onClick={()=>{setScale(option);setSeed(42);setSelectedUav("")}}>{option[0].toUpperCase()+option.slice(1)}</button>)}</div><select value={seed} onChange={(e)=>{setSeed(Number(e.target.value));setSelectedUav("")}} aria-label="Scenario seed">{instances.map((item)=><option key={item.seed} value={item.seed}>Seed {item.seed}</option>)}</select></div></header><div className="map-layout"><div className="map-panel panel"><MissionMap scenario={instance.scenario} plan={instance.plan} planned={false}/><div className="map-legend"><span><i className="base-key"/>Bases</span><span><i className="task-key"/>Mission Task Elements</span><span><i className="topology-key"/>BattleLab-inspired synthetic topology</span><span>{instance.scenario.operating_area.width} × {instance.scenario.operating_area.height} km</span></div></div><div className="metric-stack"><Metric label="Mission Task Elements" value={String(instance.scenario.tasks.length)} note="Each collection action is assigned exactly once"/><Metric label="UAVs" value={String(instance.scenario.uavs.length)} note={`${new Set(instance.scenario.uavs.flatMap(u=>u.sensors)).size} sensor types across the fleet`}/><Metric label="Home bases" value={String(instance.scenario.bases.length)}/><Metric label="Decision seed" value={String(seed)} note="Deterministic scenario generation"/></div></div></div>}

      {slide === 2 && <div className="slide centred"><div className="eyebrow">2 · The method</div><h2>Probabilistic assignment.<br/>Deterministic mission completion.</h2><p className="lede">The QUBO covers sensor-feasible MTE assignment through a load-balancing surrogate. Sequencing, timing, repair, and validation remain classical.</p><Pipeline/><div className="number-grid"><Metric label="Eligible assignment variables" value={String(instance.plan.metadata.number_of_pbits ?? "—")} note="Binary QUBO for this instance"/><Metric label="Samples" value={Number(instance.plan.metadata.number_of_samples ?? 0).toLocaleString()}/><Metric label="Assignment repairs" value={String(instance.plan.metadata.assignment_repairs ?? "—")} note="For the displayed saved plan"/></div>{technical && <div className="technical-note">{String(instance.plan.metadata.seed_note)} Requested seed: {String(instance.plan.metadata.requested_seed)} · applied by SDK: {String(instance.plan.metadata.seed_applied)}.</div>}</div>}

      {slide === 3 && <div className="slide"><header className="heading"><div><div className="eyebrow">3 · The plan</div><h2>Every MTE assigned.<br/>Every route brought home.</h2></div><div className="plan-heading-actions"><label className="showcase-uav-select tactical-select"><span>Focus aircraft</span><select aria-label="Focus aircraft" value={effectiveUav} onChange={(event)=>setSelectedUav(event.target.value)}>{activeUavs.map((route)=><option key={route.uav_id} value={route.uav_id}>{route.uav_id}</option>)}</select></label><span className="status">✓ independently feasible</span></div></header><div className="plan-layout"><div className="showcase-replay-map"><AnimatedUAVMap key={`${instance.scenario.scenario_id}-${effectiveUav}`} scenario={instance.scenario} plan={instance.plan} expandable selectedUav={effectiveUav}/></div><div className="plan-details"><div className="metric-row"><Metric label="Mission makespan" value={`${fmt(instance.plan.mission_end_time)} min`}/><Metric label="Travel distance" value={`${fmt(instance.validation.metrics.total_travel_distance,0)} km`}/><Metric label="Mean utilisation" value={pct(avgUtilisation)}/></div><div className="panel gantt-panel"><div className="panel-kicker">Scheduled service by aircraft</div><MissionGantt plan={instance.plan}/></div><div className="warning-note"><strong>{instance.validation.metrics.number_of_conflicts} separation warnings</strong><span>Detected after solving; deconfliction is not yet inside the optimisation.</span></div></div></div></div>}

      {slide === 4 && <div className="slide"><header className="heading"><div><div className="eyebrow">4 · Across seeds</div><h2>A result is not<br/>a single lucky run.</h2></div><p>Same scale · {instances.length} generated instances · identical solver configuration</p></header><SeedTable instances={instances}/><div className="comparison-strip"><div><span>Mean makespan change</span><strong className={aggregate.makespan<0?"lower":"higher"}>{aggregate.makespan>0?"+":""}{fmt(aggregate.makespan)}%</strong><small>ORBIT hybrid vs greedy</small></div><div><span>Mean travel-distance change</span><strong className={aggregate.distance<0?"lower":"higher"}>{aggregate.distance>0?"+":""}{fmt(aggregate.distance)}%</strong><small>ORBIT hybrid vs greedy</small></div><div><span>Feasible saved plans</span><strong>{instances.filter((item)=>item.validation.feasible).length} / {instances.length}</strong><small>Independent validation</small></div></div><div className="plain-note">For these synthetic {scale} instances, the route-aware hybrid {aggregate.makespan < 0 ? "shortens mean makespan" : "uses the greedy safety fallback when needed"} and {aggregate.distance < 0 ? "reduces mean travel distance" : "makes the distance trade-off explicit"}. Results remain instance-specific.</div></div>}

      {slide === 5 && <div className="slide centred final-slide"><div className="eyebrow">5 · Capability demonstrated</div><h2>Complex decisions.<br/>Defensible mission plans.</h2><p className="lede">The result is more than a solver sample: it is an end-to-end path from a constrained decision space to routes that can be inspected, compared, and independently checked.</p><div className="pdit-grid capability-grid"><article className="panel"><span>Large-case decision model</span><strong>{maximumVariables.toLocaleString()}</strong><small>eligible assignment variables</small><b>300 MTEs · 40 UAVs</b></article><div className="versus">+</div><article className="panel featured"><span>Recorded assurance</span><strong>{feasiblePlans} / {totalPlans}</strong><small>independently feasible plans</small><b>Safety fallback retained</b></article></div><div className="evidence-boundary"><strong>Next proof point</strong><span>Representative mission data, operational constraints, user evaluation, and hardware-in-the-loop execution.</span></div><div className="cta-row"><button className="button" onClick={()=>{setSlide(1);setScale(featuredScale);setSeed(42);setSelectedUav("")}}>Explore {featuredScale} instance</button><Link className="button primary" href="/presentation">Open capability briefing</Link></div></div>}

      {slide === 6 && <div className="slide qubo-appendix"><div className="eyebrow">6 · Technical appendix</div><h2>Inside the assignment QUBO.</h2><div className="qubo-equation"><span>MINIMISE</span><strong>E(x) = x<sup>T</sup>Qx</strong><em>x<sub>u,t</sub> ∈ &#123;0, 1&#125;</em></div><div className="qubo-terms"><article><b>x<sub>u,t</sub></b><strong>Assignment bit</strong><span>1 when UAV u performs MTE t. Incompatible sensor pairings are omitted.</span></article><article><b>A(Σx − 1)²</b><strong>Penalty</strong><span>Makes exactly one eligible UAV per MTE the lowest-energy choice.</span></article><article><b>Q<sub>ij</sub></b><strong>Coupling</strong><span>Links assignment pairs through shared workload and geographic compactness.</span></article><article><b>E(x)</b><strong>Energy</strong><span>The score sampled by ORBIT: lower energy means a more promising assignment.</span></article></div><div className="qubo-boundary"><strong>QUBO</strong><span>assigns MTEs</span><i>→</i><strong>Classical stages</strong><span>sequence, time and validate routes</span></div></div>}

      {slide === 7 && <div className="slide centred questions-slide"><div className="eyebrow">7 · Discussion</div><h2>Questions?</h2><p>Where could this capability create the most value in your planning workflow?</p><div className="question-prompts"><span>Operational constraints</span><span>System integration</span><span>Proof-of-concept scope</span></div><div className="cta-row"><Link className="button" href="/presentation">Open capability briefing</Link><button className="button primary" onClick={()=>{setSlide(0);setScale("large");setSeed(42);setSelectedUav("")}}>Restart showcase</button></div></div>}
    </section>

    <footer className="footer"><button disabled={slide===0} onClick={()=>navigate(slide-1)}>← Previous</button><div><strong>{String(slide+1).padStart(2,"0")}</strong><span>/</span><span>{String(slides.length).padStart(2,"0")}</span><em>{slides[slide]}</em></div><button disabled={slide===slides.length-1} onClick={()=>navigate(slide+1)}>Next →</button></footer>
    {technical && <aside className="technical-drawer"><div><span>Technical evidence</span><button onClick={()=>setTechnical(false)}>×</button></div><dl><dt>Scenario</dt><dd>{instance.scenario.scenario_id}</dd><dt>Solver</dt><dd>{instance.plan.solver_name}</dd><dt>ORBIT runtime</dt><dd>{fmt(orbit.runtime_seconds,3)} s</dd><dt>Greedy runtime</dt><dd>{fmt(greedy.runtime_seconds,4)} s</dd><dt>SDK backend</dt><dd>{String(instance.plan.metadata.sdk_backend)}</dd><dt>Hardware execution</dt><dd>{String(instance.plan.metadata.hardware_execution)}</dd><dt>Minimum separation</dt><dd>{String(instance.validation.metrics.minimum_separation)} km</dd></dl><p>Scenario seed controls generation. The installed SDK records that its stochastic simulator seed was not applied.</p></aside>}
  </main>;
}
