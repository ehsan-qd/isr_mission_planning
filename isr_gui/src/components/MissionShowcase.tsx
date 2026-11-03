"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Evidence, MissionInstance, Scale } from "@/lib/types";
import { AmbientNetwork } from "./AmbientNetwork";
import { AnimatedUAVMap } from "./AnimatedUAVMap";
import { BrandMark } from "./BrandMark";
import { FullscreenButton } from "./FullscreenButton";
import { InstanceDifficulty } from "./InstanceDifficulty";
import { MissionGantt } from "./MissionGantt";
import { MissionMap } from "./MissionMap";

const slides = ["The mission", "The instance", "The method", "The plan", "Across seeds", "Capability and next trial", "QUBO appendix", "Questions"];
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

function changeText(value: number) {
  const rounded = Number(value.toFixed(1));
  return `${rounded > 0 ? "+" : ""}${rounded.toFixed(1)}%`;
}

function changeClass(value: number) {
  const rounded = Number(value.toFixed(1));
  return rounded < 0 ? "lower" : rounded > 0 ? "higher" : "";
}

function ResultsMetric({ instances, metric, title, unit, description, meanChange }: {
  instances: MissionInstance[];
  metric: "makespan" | "total_distance";
  title: string;
  unit: string;
  description: string;
  meanChange: number;
}) {
  const formatValue = (value: number) => value.toLocaleString("en-GB", {
    minimumFractionDigits: metric === "makespan" ? 1 : 0,
    maximumFractionDigits: metric === "makespan" ? 1 : 0,
  });
  return <section className="results-metric panel" aria-label={`${title} comparison`}>
    <header><h3>{title} <span>{unit}</span></h3><p>{description}</p></header>
    <table aria-label={`${title} by seed (${unit})`}>
      <thead><tr><th scope="col">Seed</th><th scope="col">Greedy</th><th scope="col" className="results-orbit">ORBIT</th><th scope="col">Change</th></tr></thead>
      <tbody>{instances.map((item) => {
        const greedyValue = item.benchmarks.greedy[metric];
        const orbitValue = item.benchmarks.orbit_hybrid[metric];
        const change = delta(orbitValue, greedyValue);
        return <tr key={item.seed}>
          <th scope="row">{item.seed}</th>
          <td>{formatValue(greedyValue)}</td>
          <td className="results-orbit">{formatValue(orbitValue)}</td>
          <td className={changeClass(change)}>{changeText(change)}</td>
        </tr>;
      })}</tbody>
    </table>
    <footer><span>Change in mean {title.toLowerCase()}</span><strong className={changeClass(meanChange)}>{changeText(meanChange)}</strong></footer>
  </section>;
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
  const avgUtilisation = Object.values(instance.validation.metrics.uav_utilisation).reduce((a,b)=>a+b,0) / Object.keys(instance.validation.metrics.uav_utilisation).length;

  return <main className="showcase-shell" data-slide={slide}>
    <AmbientNetwork/>
    <header className="topbar">
      <div className="brand"><BrandMark/><div><strong>ORBIT ISR Mission Planning</strong><span>Assign. Sequence. Validate.</span></div></div>
      <nav className="progress" aria-label="Demonstration progress">{slides.map((label,index)=><button key={label} className={index===slide?"active":index<slide?"complete":""} aria-current={index===slide?"step":undefined} aria-label={`Go to ${index+1}. ${label}`} onClick={()=>navigate(index)}><span/></button>)}</nav>
      <div className="top-actions">
        <Link className="view-link" href="/demonstrator">Watch 2:45 demo</Link>
        <FullscreenButton/>
        <div className="segmented" role="group" aria-label="Detail level">
          <button aria-pressed={!technical} onClick={()=>setTechnical(false)}>Executive</button>
          <button aria-pressed={technical} onClick={()=>setTechnical(true)}>Technical</button>
        </div>
      </div>
    </header>

    <section className="frame" key={`${slide}-${scale}-${seed}`}>
      {slide === 0 && <div className="slide title-slide">
        <div className="eyebrow">Smarter mission planning</div>
        <h1>Turn complex missions<br/>into clear plans.</h1>
        <p>Heterogeneous UAVs. Sensor-constrained Mission Task Elements. One plan that assigns every MTE, sequences every route, and returns every aircraft home.</p>
        <div className="simple-flow">{[["01","Define tasks"],["02","Assign aircraft"],["03","Plan routes"],["04","Review plan"]].map(([n,t])=><div key={n}><small>{n}</small><strong>{t}</strong></div>)}</div>
        <button className="button primary" onClick={()=>navigate(1)}>Explore a mission <span>→</span></button>
      </div>}

      {slide === 1 && <div className="slide instance-slide"><header className="heading"><div><div className="eyebrow">1 · The instance</div><h2>One operating area.<br/>Many coupled decisions.</h2></div><div className="selectors"><div className="segmented">{availableScales.map((option)=><button key={option} aria-pressed={scale===option} onClick={()=>{setScale(option);setSeed(42);setSelectedUav("")}}>{option[0].toUpperCase()+option.slice(1)}</button>)}</div><select value={seed} onChange={(e)=>{setSeed(Number(e.target.value));setSelectedUav("")}} aria-label="Scenario seed">{instances.map((item)=><option key={item.seed} value={item.seed}>Seed {item.seed}</option>)}</select></div></header><div className="map-layout"><div className="map-panel panel"><MissionMap scenario={instance.scenario} plan={instance.plan} planned={false}/><div className="map-legend"><span><i className="base-key"/>Bases</span><span><i className="task-key"/>Mission Task Elements</span><span><i className="topology-key"/>BattleLab-inspired synthetic topology</span><span>{instance.scenario.operating_area.width} × {instance.scenario.operating_area.height} km</span></div></div><aside className="instance-sidebar" aria-label="Instance summary">
            <dl className="instance-facts panel">
              <div><dt title="Mission Task Elements">MTEs</dt><dd>{instance.scenario.tasks.length}</dd></div>
              <div><dt>UAVs</dt><dd>{instance.scenario.uavs.length}</dd></div>
              <div><dt>Home bases</dt><dd>{instance.scenario.bases.length}</dd></div>
            </dl>
            <InstanceDifficulty instance={instance}/>
          </aside></div></div>}

      {slide === 2 && <div className="slide centred"><div className="eyebrow">2 · The method</div><h2>Probabilistic assignment.<br/>Deterministic mission completion.</h2><p className="lede">The QUBO covers sensor-feasible MTE assignment through a load-balancing surrogate. Sequencing, timing, repair, and validation remain classical.</p><Pipeline/><div className="number-grid"><Metric label="Eligible assignment variables" value={String(instance.plan.metadata.number_of_pbits ?? "—")} note="Binary QUBO for this instance"/><Metric label="Samples" value={Number(instance.plan.metadata.number_of_samples ?? 0).toLocaleString()}/><Metric label="Assignment repairs" value={String(instance.plan.metadata.assignment_repairs ?? "—")} note="For the displayed saved plan"/></div>{technical && <div className="technical-note">{String(instance.plan.metadata.seed_note)} Requested seed: {String(instance.plan.metadata.requested_seed)} · applied by SDK: {String(instance.plan.metadata.seed_applied)}.</div>}</div>}

      {slide === 3 && <div className="slide"><header className="heading"><div><div className="eyebrow">3 · The plan</div><h2>Every MTE assigned.<br/>Every route brought home.</h2></div><div className="plan-heading-actions"><label className="showcase-uav-select tactical-select"><span>Focus aircraft</span><select aria-label="Focus aircraft" value={effectiveUav} onChange={(event)=>setSelectedUav(event.target.value)}>{activeUavs.map((route)=><option key={route.uav_id} value={route.uav_id}>{route.uav_id}</option>)}</select></label><span className="status">✓ independently feasible</span></div></header><div className="plan-layout"><div className="showcase-replay-map"><AnimatedUAVMap key={`${instance.scenario.scenario_id}-${effectiveUav}`} scenario={instance.scenario} plan={instance.plan} expandable selectedUav={effectiveUav}/></div><div className="plan-details"><div className="metric-row"><Metric label="Mission makespan" value={`${fmt(instance.plan.mission_end_time)} min`}/><Metric label="Distance travelled" value={`${fmt(instance.validation.metrics.total_travel_distance,0)} km`}/><Metric label="Mean utilisation" value={pct(avgUtilisation)}/></div><div className="panel gantt-panel"><div className="panel-kicker">Scheduled service by aircraft</div><MissionGantt plan={instance.plan}/></div><div className="warning-note"><strong>{instance.validation.metrics.number_of_conflicts} separation warnings</strong><span>Detected after solving; deconfliction is not yet inside the optimisation.</span></div></div></div></div>}

      {slide === 4 && <div className="slide results-slide">
        <header className="heading">
          <div><div className="eyebrow">4 · Results across seeds</div><h2>ORBIT vs greedy.</h2></div>
          <p>{scale[0].toUpperCase() + scale.slice(1)} · {instance.scenario.tasks.length} MTEs · {instance.scenario.uavs.length} UAVs · {instances.length} seeds</p>
        </header>
        <div className="results-guide">Lower is better <span>Percentage change: ORBIT vs greedy</span></div>
        <div className="results-grid">
          <ResultsMetric instances={instances} metric="makespan" title="Makespan" unit="min" description="Time until the last UAV returns" meanChange={aggregate.makespan}/>
          <ResultsMetric instances={instances} metric="total_distance" title="Distance travelled" unit="km" description="Total distance across the fleet" meanChange={aggregate.distance}/>
        </div>
        <div className="results-note"><span><strong>{instances.filter((item)=>item.validation.feasible).length} / {instances.length}</strong> saved plans validated</span><span>Recorded software-simulator results</span></div>
      </div>}


      {slide === 5 && <div className="slide proof-slide">
        <header className="heading"><div><div className="eyebrow">5 · Capability and next trial</div><h2>A <strong>reusable approach</strong> to<br/>assignment, scheduling and planning.</h2></div></header>
        <div className="proof-columns">
          <section className="panel proof-demonstrated" aria-labelledby="demonstrated-title">
            <header><h3 id="demonstrated-title">Demonstrated approach</h3><p>ISR example: QUBO assignment + classical scheduling</p></header>
            <ul>
              <li><span>Represent <strong>tasks, resources and eligibility</strong></span></li>
              <li><span><strong>Optimise assignments;</strong> sequence and validate</span></li>
              <li><span><strong>Benchmark plan quality</strong> against a baseline</span></li>
            </ul>
          </section>
          <section className="panel" aria-labelledby="validate-title">
            <header><h3 id="validate-title">Next to validate</h3><p>Adapt the formulation and constraints to each use case</p></header>
            <ul>
              <li><span><strong>Assignment</strong> · teams, machines and assets</span></li>
              <li><span><strong>Scheduling</strong> · jobs, shifts and maintenance</span></li>
              <li><span><strong>Planning</strong> · logistics, fleets and operations</span></li>
            </ul>
          </section>
        </div>
        <div className="proof-trial"><span>Next trial</span><p>Formulate your planning problem and <strong>compare ORBIT</strong> with your current approach.</p></div>
      </div>}


      {slide === 6 && <div className="slide qubo-appendix"><div className="eyebrow">6 · Technical appendix</div><h2>Inside the assignment QUBO.</h2><div className="qubo-equation"><span>MINIMISE</span><strong>E(x) = x<sup>T</sup>Qx</strong><em>x<sub>u,t</sub> ∈ &#123;0, 1&#125;</em></div><div className="qubo-terms"><article><b>x<sub>u,t</sub></b><strong>Assignment bit</strong><span>1 when UAV u performs MTE t. Incompatible sensor pairings are omitted.</span></article><article><b>A(Σx − 1)²</b><strong>Penalty</strong><span>Makes exactly one eligible UAV per MTE the lowest-energy choice.</span></article><article><b>Q<sub>ij</sub></b><strong>Coupling</strong><span>Links assignment pairs through shared workload and geographic compactness.</span></article><article><b>E(x)</b><strong>Energy</strong><span>The score sampled by ORBIT: lower energy means a more promising assignment.</span></article></div><div className="qubo-boundary"><strong>QUBO</strong><span>assigns MTEs</span><i>→</i><strong>Classical stages</strong><span>sequence, time and validate routes</span></div></div>}

      {slide === 7 && <div className="slide centred questions-slide"><div className="eyebrow">7 · Discussion</div><h2>Questions?</h2><p>Where could this capability create the most value in your planning workflow?</p><div className="question-prompts"><span>Operational constraints</span><span>System integration</span><span>Proof-of-concept scope</span></div><div className="cta-row"><Link className="button" href="/presentation">Open capability briefing</Link><button className="button primary" onClick={()=>{setSlide(0);setScale("large");setSeed(42);setSelectedUav("")}}>Restart showcase</button></div></div>}
    </section>

    <footer className="footer"><button disabled={slide===0} onClick={()=>navigate(slide-1)}>← Previous</button><div><strong>{String(slide+1).padStart(2,"0")}</strong><span>/</span><span>{String(slides.length).padStart(2,"0")}</span><em>{slides[slide]}</em></div><button disabled={slide===slides.length-1} onClick={()=>navigate(slide+1)}>Next →</button></footer>
    {technical && <aside className="technical-drawer"><div><span>Technical evidence</span><button onClick={()=>setTechnical(false)}>×</button></div><dl><dt>Scenario</dt><dd>{instance.scenario.scenario_id}</dd><dt>Solver</dt><dd>{instance.plan.solver_name}</dd><dt>ORBIT runtime</dt><dd>{fmt(orbit.runtime_seconds,3)} s</dd><dt>Greedy runtime</dt><dd>{fmt(greedy.runtime_seconds,4)} s</dd><dt>SDK backend</dt><dd>{String(instance.plan.metadata.sdk_backend)}</dd><dt>Hardware execution</dt><dd>{String(instance.plan.metadata.hardware_execution)}</dd><dt>Minimum separation</dt><dd>{String(instance.validation.metrics.minimum_separation)} km</dd></dl><p>Scenario seed controls generation. The installed SDK records that its stochastic simulator seed was not applied.</p></aside>}
  </main>;
}
