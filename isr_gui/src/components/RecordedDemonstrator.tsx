"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AmbientNetwork } from "./AmbientNetwork";
import { BrandMark } from "./BrandMark";
import { FullscreenButton } from "./FullscreenButton";
import { advancePlayback, chapterAt, clockLabel, DEMO_CHAPTERS, DEMO_DURATION, missionTimeAt, PLAYBACK_SPEEDS, positionAt, summariseInstance } from "@/lib/demonstrator";
import type { MissionInstance, Route } from "@/lib/types";

type Comparison = { seed: number; benchmarks: MissionInstance["benchmarks"]; fallback: boolean };
type Speed = (typeof PLAYBACK_SPEEDS)[number];
const sensorColors: Record<string, string> = { EO: "#7dded0", IR: "#f2bb6d", SAR: "#b6abff" };
const highlight = "#ffc400";
const format = (value: number, digits = 1) => value.toLocaleString("en-GB", { maximumFractionDigits: digits, minimumFractionDigits: digits });

function CompareBars({ title, unit, greedy, hybrid, reduction }: { title: string; unit: string; greedy: number; hybrid: number; reduction: number }) {
  return <div className="demo-comparison">
    <header><span>{title}</span><strong>−{format(reduction)}%</strong></header>
    <div className="demo-bar-row"><span>Greedy</span><div><i style={{ width: "100%" }}/></div><b>{format(greedy)} <small>{unit}</small></b></div>
    <div className="demo-bar-row hybrid"><span>Hybrid</span><div><i style={{ width: `${hybrid / greedy * 100}%` }}/></div><b>{format(hybrid)} <small>{unit}</small></b></div>
  </div>;
}

function MissionReplay({ instance, chapter, missionTime, selected }: { instance: MissionInstance; chapter: number; missionTime: number; selected: Route }) {
  const { scenario, plan } = instance;
  const { width, height } = scenario.operating_area;
  const focus = chapter === 4;
  const showRoutes = chapter >= 2;
  const assignments = useMemo(() => new Map(plan.task_assignments.map(item => [item.task_id, item.uav_id])), [plan]);
  const completions = useMemo(() => new Map(plan.uav_routes.flatMap(route => route.scheduled_tasks.map(task => [task.task_id, task.finish_time] as const))), [plan]);
  const selectedTasks = selected.scheduled_tasks.filter(task => task.finish_time <= missionTime).length;
  const completed = Array.from(completions.values()).filter(time => time <= missionTime).length;
  const currentTask = selected.scheduled_tasks.find(task => missionTime >= task.start_time && missionTime < task.finish_time);
  const activity = missionTime >= selected.return_time ? "Home · sortie complete" : currentTask ? `Collecting ${currentTask.task_id.replace("TASK_", "MTE ")}` : "In transit";
  return <div className="demo-map-panel">
    <div className="demo-panel-top"><span>{focus ? `${selected.uav_id} route` : showRoutes ? "Fleet routes" : "Mission area"}</span><span>{scenario.operating_area.width} × {scenario.operating_area.height} units</span></div>
    <div className="demo-map-surface">
      <svg viewBox={`-25 -25 ${width + 50} ${height + 50}`} role="img" aria-label={focus ? `${selected.uav_id} route with aircraft position at ${format(missionTime)} mission minutes` : "300 collection tasks and six bases, with recorded fleet routes and positions"}>
        <defs><pattern id="demo-map-grid" width="60" height="60" patternUnits="userSpaceOnUse"><path d="M 60 0 H 0 V 60" fill="none" stroke="#bcecec" strokeOpacity=".09" strokeWidth=".6"/></pattern></defs>
        <rect width={width} height={height} fill="url(#demo-map-grid)" stroke="#bcecec" strokeOpacity=".24"/>
        {showRoutes && plan.uav_routes.flatMap(route => route.trajectory_segments.map((segment, index) => <line key={`${route.uav_id}-${index}`} x1={segment.start.x} y1={height - segment.start.y} x2={segment.end.x} y2={height - segment.end.y} stroke={focus && route.uav_id === selected.uav_id ? highlight : "#89c2d9"} opacity={focus ? route.uav_id === selected.uav_id ? 1 : .08 : .5} strokeWidth={focus && route.uav_id === selected.uav_id ? 2.6 : 1.2} vectorEffect="non-scaling-stroke"/>))}
        {scenario.tasks.map(task => {
          const isSelected = assignments.get(task.id) === selected.uav_id;
          const done = chapter >= 3 && (completions.get(task.id) ?? Infinity) <= missionTime;
          const color = focus && isSelected ? highlight : sensorColors[task.required_sensor] ?? "#fff";
          return <circle key={task.id} cx={task.location.x} cy={height - task.location.y} r={focus && isSelected ? 4.4 : 2.9} fill={done ? color : "#06131f"} stroke={color} strokeWidth="1.2" opacity={focus && !isSelected ? .2 : 1}><title>{`${task.id} · ${task.required_sensor} · ${assignments.get(task.id)}${done ? " · complete" : ""}`}</title></circle>;
        })}
        {scenario.bases.map(base => <g key={base.id} transform={`translate(${base.location.x} ${height - base.location.y})`}><rect x="-6" y="-6" width="12" height="12" fill="#bcecec" stroke="#000" strokeWidth="2"/><text x={base.location.x > width / 2 ? -13 : 13} y="-11" textAnchor={base.location.x > width / 2 ? "end" : "start"} fill="#e8fbfb" fontSize="17" fontWeight="600" letterSpacing=".06em" stroke="#000" strokeOpacity=".85" strokeWidth="4" paintOrder="stroke">{base.id.replace("BASE_", "BASE ")}</text></g>)}
        {chapter >= 3 && plan.uav_routes.filter(route => route.scheduled_tasks.length > 0 && (!focus || route.uav_id === selected.uav_id)).map(route => {
          const point = positionAt(route, missionTime);
          if (!point) return null;
          return <g key={route.uav_id} transform={`translate(${point.x} ${height - point.y})`}><circle r={focus ? 14 : 7} fill={focus ? highlight : "#bcecec"} opacity=".2"/><path d={focus ? "M 0 -7 L 5.5 5.5 L 0 2.8 L -5.5 5.5 Z" : "M 0 -5.5 L 4.4 4.4 L 0 2.2 L -4.4 4.4 Z"} fill={focus ? highlight : "#f2ffff"} stroke="#000" strokeWidth=".8"/></g>;
        })}
      </svg>
      {chapter >= 3 && <div className="demo-map-telemetry"><span>Mission time</span><strong>{format(missionTime)} <small>min</small></strong><span>{focus ? `${selectedTasks} / ${selected.scheduled_tasks.length} tasks · ${activity}` : `${completed} / ${scenario.tasks.length} tasks complete`}</span></div>}
    </div>
    <div className="demo-legend">{Object.entries(sensorColors).map(([sensor, color]) => <span key={sensor}><i style={{ background: color }}/>{sensor} sensor</span>)}<span><i className="square"/>Base</span>{chapter >= 3 && <span>Filled point = completed</span>}{focus && <span className="gold">Gold = selected route</span>}</div>
  </div>;
}

function FleetSchedule({ instance, active, selected, onSelect }: { instance: MissionInstance; active: Route[]; selected: string; onSelect: (id: string) => void }) {
  const end = instance.plan.mission_end_time;
  return <div className="demo-schedule">
    <div className="demo-panel-top"><span>All {active.length} active aircraft · sorted by return time</span><span>Click a row to inspect</span></div>
    <div className="demo-schedule-axis"><span>UAV / MTEs</span><div><span>0</span><span>{format(end / 2)} min</span><span>{format(end)} min</span></div><span>Return</span></div>
    <div className="demo-schedule-rows">{active.map(route => <button key={route.uav_id} className={selected === route.uav_id ? "selected" : ""} onClick={() => onSelect(route.uav_id)} aria-pressed={selected === route.uav_id} aria-label={`Inspect ${route.uav_id}, ${route.scheduled_tasks.length} tasks, returns at ${format(route.return_time)} minutes`}>
      <span>{route.uav_id.replace("UAV_", "U") } <small>/ {route.scheduled_tasks.length}</small></span><div className="demo-schedule-track"><i style={{ width: `${route.return_time / end * 100}%` }}/>{route.scheduled_tasks.map(task => <b key={task.task_id} title={`${task.task_id}: ${format(task.start_time)}–${format(task.finish_time)} min`} style={{ left: `${task.start_time / end * 100}%`, width: `${(task.finish_time - task.start_time) / end * 100}%` }}/>)}</div><strong>{format(route.return_time)}</strong>
    </button>)}</div>
    <div className="demo-legend"><span><i style={{ background: "rgba(137,194,217,.28)" }}/>Transit / route duration</span><span><i style={{ background: "#89c2d9" }}/>Collection dwell</span><span className="gold">Gold = inspected aircraft</span></div>
  </div>;
}

export function RecordedDemonstrator({ instance, comparisons }: { instance: MissionInstance; comparisons: Comparison[] }) {
  const summary = useMemo(() => summariseInstance(instance), [instance]);
  const [playback, setPlayback] = useState({ seconds: 0, playing: true });
  const [loop, setLoop] = useState(false);
  const [speed, setSpeed] = useState<Speed>(1);
  const [selectedId, setSelectedId] = useState(summary.active[0].uav_id);
  const chapter = chapterAt(playback.seconds);
  const scene = DEMO_CHAPTERS[chapter];
  const selected = summary.active.find(route => route.uav_id === selectedId) ?? summary.active[0];
  const { scenario, plan, validation, benchmarks } = instance;
  const greedy = benchmarks.greedy;
  const hybrid = benchmarks.orbit_hybrid;
  const missionTime = missionTimeAt(playback.seconds, plan.mission_end_time, selected.return_time);
  const service = selected.scheduled_tasks.reduce((sum, task) => sum + task.finish_time - task.start_time, 0);

  useEffect(() => {
    if (!playback.playing) return;
    let frame = 0;
    let previous = performance.now();
    let accumulated = 0;
    const tick = (now: number) => {
      // A hidden tab freezes the story instead of skipping unseen chapters.
      if (!document.hidden) accumulated += Math.min((now - previous) / 1000, .25);
      previous = now;
      if (accumulated >= .04) {
        const delta = accumulated;
        accumulated = 0;
        setPlayback(state => advancePlayback(state.seconds, delta * speed, loop));
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playback.playing, loop, speed]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof Element && event.target.closest("input,button,a,select,textarea,[contenteditable]")) return;
      if (event.key === " ") { event.preventDefault(); setPlayback(state => ({ seconds: state.seconds >= DEMO_DURATION ? 0 : state.seconds, playing: !state.playing })); }
      const keySpeed = PLAYBACK_SPEEDS.find(value => String(value) === event.key);
      if (keySpeed) setSpeed(keySpeed);
      if (event.key.toLowerCase() === "r") { setSelectedId(summary.active[0].uav_id); setPlayback({ seconds: 0, playing: true }); }
      if (event.key === "ArrowRight" || event.key === "ArrowLeft") { event.preventDefault(); setPlayback(state => ({ seconds: Math.min(DEMO_DURATION, Math.max(0, state.seconds + (event.key === "ArrowRight" ? 10 : -10))), playing: false })); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [summary]);

  const captions: [number, string][] = [
    [0, `Assign ${scenario.tasks.length} collection tasks to ${scenario.uavs.length} UAVs and bring every aircraft home.`],
    [9, "Each task needs the right sensor and time to collect. The plan combines assignment, travel and collection."],
    [18, `${summary.variables.toLocaleString("en-GB")} eligible aircraft–task pairs. Choose exactly one aircraft for each task.`],
    [28, `About ${summary.coefficient} × 10^${summary.exponent} compatible assignments, before route order and timing. The solver samples this space.`],
    [38, "Sample candidate assignments, repair them, then build and refine the routes."],
    [48, "Keep the plan with the earlier finish, compare against greedy, and validate the assignments."],
    [58, `Mission duration falls from ${format(greedy.makespan)} to ${format(hybrid.makespan)} minutes. Watch the fleet complete its tasks.`],
    [68, `${format(summary.distanceReduction)}% less travel. ${format(greedy.makespan - hybrid.makespan)} minutes earlier home. Two different measures of improvement.`],
    [78, `All ${scenario.tasks.length} tasks covered using ${summary.active.length} aircraft. ${scenario.uavs.length - summary.active.length} remain unassigned.`],
    [88, `Follow ${selected.uav_id}: ${selected.scheduled_tasks.length} tasks, returning at ${format(selected.return_time)} minutes. Its route is highlighted in gold.`],
    [99, `Watch the stops: ${format(service)} minutes are spent collecting. Shorter travel cannot remove that work.`],
    [110, `The mission ends when the last aircraft reaches home, not when the final observation is collected.`],
    [119, `The three longest routes return at ${summary.active.slice(0, 3).map(route => format(route.return_time, 2)).join(", ")} minutes. These set the finish.`],
    [130, `${format(summary.distanceReduction)}% less distance, but ${format(summary.makespanReduction)}% less mission time. Collection dwell and the longest route still matter.`],
    [138, "Every aircraft need not fly. This plan leaves spare aircraft, without claiming a minimum fleet size."],
    [145, "Two of three scenarios improve on greedy. The third retains the greedy plan. No global optimum is claimed."],
    [155, `The solve took ${format(hybrid.runtime_seconds)} seconds. ${validation.metrics.number_of_conflicts} separation warnings remain; separation is checked after planning.`],
  ];
  const caption = captions.findLast(([start]) => playback.seconds >= start)![1];

  return <main className="recorded-demo" data-chapter={chapter}>
    <AmbientNetwork/>
    <header className="demo-topbar"><div className="demo-brand"><BrandMark/><strong>ISR Mission Planning</strong></div><div className="demo-header-actions"><Link className="view-link" href="/">Explore ↗</Link><FullscreenButton/></div></header>
    <div className="demo-body">
      <header className="demo-heading"><h1 key={chapter}>{scene.title}</h1></header>
      <div className="demo-stage">
        {chapter < 5 ? <MissionReplay instance={instance} chapter={chapter} missionTime={missionTime} selected={selected}/> : chapter === 5 ? <FleetSchedule instance={instance} active={summary.active} selected={selectedId} onSelect={id => { setSelectedId(id); setPlayback(state => ({ ...state, playing: false })); }}/> : <div className="demo-evidence-panel">
          <div className="demo-panel-top"><span>Three recorded scenarios</span><span>Lower makespan is better</span></div>
          <div className="demo-case-table"><div className="demo-case-head"><span>Scenario seed</span><span>Greedy</span><span>Hybrid</span><span>Outcome</span></div>{comparisons.map(item => <div className="demo-case" key={item.seed}><strong>{item.seed}</strong><span>{format(item.benchmarks.greedy.makespan)} <small>min</small></span><span>{format(item.benchmarks.orbit_hybrid.makespan)} <small>min</small></span><b>{item.fallback ? "Greedy retained" : `${format(100 * (1 - item.benchmarks.orbit_hybrid.makespan / item.benchmarks.greedy.makespan))}% earlier`}</b></div>)}</div>
          <div className="demo-closing"><h2>One plan. Every task accounted for.</h2><Link href="/">Explore the results →</Link></div>
        </div>}
        <aside className="demo-insight" key={chapter}>
          {chapter === 0 && <><h2>Who collects what,<br/>and in which order?</h2><div className="demo-facts"><div><strong>{scenario.tasks.length}</strong><span>collection tasks</span></div><div><strong>{scenario.uavs.length}</strong><span>UAVs</span></div><div><strong>{scenario.bases.length}</strong><span>home bases</span></div></div><div className="demo-callout">Objective <strong>Minimise the latest return time</strong></div></>}
          {chapter === 1 && <><div className="demo-kicker">SENSOR-COMPATIBLE ASSIGNMENTS</div><div className="demo-big-number">{summary.coefficient} × 10<sup>{summary.exponent}</sup></div><p>Possible assignments with exactly one eligible UAV per task.</p><div className="demo-space-detail"><strong>{format(summary.variables, 0)}</strong><span>binary assignment variables</span></div><p className="demo-small">Before route order and timing. The solver samples and refines this space.</p></>}
          {chapter === 2 && <><ol className="demo-method"><li><span>01</span><div><strong>Encode assignments</strong><p>QUBO scores eligibility, geography and workload.</p></div></li><li><span>02</span><div><strong>Sample assignments</strong><p>{format(Number(plan.metadata.number_of_samples), 0)} software samples.</p></div></li><li><span>03</span><div><strong>Repair & refine routes</strong><p>Sequence visits and improve actual route duration.</p></div></li><li><span>04</span><div><strong>Compare & validate</strong><p>Greedy fallback, assignment checks and spatial warnings.</p></div></li></ol></>}
          {chapter === 3 && <><CompareBars title="Total travel distance" unit="units" greedy={greedy.total_distance} hybrid={hybrid.total_distance} reduction={summary.distanceReduction}/><CompareBars title="Mission makespan" unit="min" greedy={greedy.makespan} hybrid={hybrid.makespan} reduction={summary.makespanReduction}/><div className="demo-result-stat"><strong>{format(greedy.makespan - hybrid.makespan)} min</strong><span>earlier mission completion</span></div></>}
          {chapter === 4 && <><label className="demo-aircraft-select">Aircraft <select value={selectedId} onChange={event => { setSelectedId(event.target.value); setPlayback({ seconds: 88, playing: false }); }}>{summary.active.map(route => <option key={route.uav_id} value={route.uav_id}>{route.uav_id} · {format(route.return_time)} min</option>)}</select></label><div className="demo-route-facts"><div><strong>{selected.scheduled_tasks.length}</strong><span>collection tasks</span></div><div><strong>{format(selected.return_time)} <small>min</small></strong><span>return to home base</span></div></div><div className="demo-duration-strip"><i style={{ width: `${service / selected.return_time * 100}%` }}/></div><div className="demo-duration-labels"><span>{format(service)} min collecting</span><span>{format(selected.return_time - service)} min travel / other</span></div><div className="demo-callout">Watch the pauses <strong>Collection time is real work in the schedule.</strong></div></>}
          {chapter === 5 && <><h2>Shorter routes help.<br/>The longest still decides.</h2><div className="demo-finish-times">{summary.active.slice(0, 3).map(route => <div key={route.uav_id}><span>{route.uav_id}</span><strong>{format(route.return_time, 2)} <small>min</small></strong></div>)}</div><p>The three latest returns are within {format((summary.active[0].return_time - summary.active[2].return_time) * 60)} seconds of one another.</p><div className="demo-callout">{summary.active.length} active / {scenario.uavs.length - summary.active.length} unassigned<strong>All {plan.task_assignments.length} tasks covered by this plan.</strong></div><button className="demo-route-button" onClick={() => setPlayback({ seconds: 88, playing: true })}>Replay {selectedId} →</button></>}
          {chapter === 6 && <><div className="demo-runtime"><strong>{format(hybrid.runtime_seconds)} <small>s</small></strong><span>hybrid solve time</span><p>Greedy: {format(greedy.runtime_seconds * 1000)} ms. Better mission quality, with more computation.</p></div><div className="demo-warning"><strong>{validation.metrics.number_of_conflicts} spatial warnings</strong><p>Assignment validation: {validation.feasible ? "passed" : "failed"}. Separation is reported after solving and is not an optimisation constraint.</p></div><p className="demo-small">Software simulation, not hardware. Sampler seed not applied.</p></>}
        </aside>
      </div>
      <div className="demo-caption" aria-live="off"><p>{caption}</p></div>
    </div>
    <footer className="demo-player">
      <nav aria-label="Demonstrator chapters">{DEMO_CHAPTERS.map((item, index) => <button key={item.start} className={chapter === index ? "active" : index < chapter ? "complete" : ""} aria-current={chapter === index ? "step" : undefined} onClick={() => { setSelectedId(summary.active[0].uav_id); setPlayback({ seconds: item.start, playing: false }); }}><small>{String(index + 1).padStart(2, "0")}</small>{item.label}</button>)}</nav>
      <div className="demo-transport"><button className="demo-play" onClick={() => setPlayback(state => ({ seconds: state.seconds >= DEMO_DURATION ? 0 : state.seconds, playing: !state.playing }))}>{playback.playing ? "Ⅱ Pause" : playback.seconds >= DEMO_DURATION ? "▶ Replay" : "▶ Play"}</button><button onClick={() => { setSelectedId(summary.active[0].uav_id); setPlayback({ seconds: 0, playing: true }); }} aria-label="Restart demonstrator">↺ Restart</button><label className="demo-scrubber"><span className="demo-sr-only">Demonstrator position in seconds</span><input type="range" min="0" max={DEMO_DURATION} step="0.1" value={playback.seconds} onChange={event => setPlayback({ seconds: Number(event.target.value), playing: false })}/></label><time>{clockLabel(playback.seconds)} / 2:45</time><div className="demo-speed" role="group" aria-label="Playback speed"><span aria-hidden="true">Speed</span>{PLAYBACK_SPEEDS.map(value => <button key={value} aria-pressed={speed === value} aria-label={`Play at ${value} times speed`} onClick={() => setSpeed(value)}>{value}×</button>)}</div><button aria-pressed={loop} onClick={() => setLoop(value => !value)}>↻ Loop {loop ? "on" : "off"}</button></div>
      <div className="demo-player-note">Synthetic simulation · recorded replay</div>
    </footer>
  </main>;
}
