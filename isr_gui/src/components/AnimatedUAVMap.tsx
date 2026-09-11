"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Plan, Route, Scenario, Waypoint } from "@/lib/types";

const PLAYBACK_SECONDS = 24;

function positionAt(route: Route, time: number): { point: Waypoint; activity: string } {
  const segments = route.trajectory_segments;
  if (!segments.length) return { point: { x: 0, y: 0, label: route.uav_id }, activity: "No assigned MTEs" };
  if (time <= segments[0].start_time) return { point: segments[0].start, activity: "At home base" };

  for (const segment of segments) {
    if (time >= segment.start_time && time <= segment.end_time) {
      const duration = Math.max(segment.end_time - segment.start_time, Number.EPSILON);
      const progress = (time - segment.start_time) / duration;
      return {
        point: {
          x: segment.start.x + (segment.end.x - segment.start.x) * progress,
          y: segment.start.y + (segment.end.y - segment.start.y) * progress,
          label: route.uav_id,
        },
        activity: `Transit · ${segment.from_id} → ${segment.to_id}`,
      };
    }
    if (time < segment.start_time) {
      const task = route.scheduled_tasks.find((item) => time >= item.start_time && time <= item.finish_time);
      return { point: segment.start, activity: task ? `Collecting · ${task.task_id}` : "Holding" };
    }
  }

  return { point: segments.at(-1)!.end, activity: time >= route.return_time ? "Mission complete" : "Returning" };
}

export function AnimatedUAVMap({ scenario, plan, selectedUav, expandable = false }: {
  scenario: Scenario;
  plan: Plan;
  selectedUav: string;
  expandable?: boolean;
}) {
  const route = plan.uav_routes.find((item) => item.uav_id === selectedUav) ?? plan.uav_routes[0];
  const duration = Math.max(route?.return_time ?? plan.mission_end_time, 0.1);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const expandButtonRef = useRef<HTMLButtonElement>(null);
  const hasExpandedRef = useRef(false);
  const timeRef = useRef(0);

  useEffect(() => {
    if (!expanded) {
      if (hasExpandedRef.current) expandButtonRef.current?.focus();
      return;
    }
    hasExpandedRef.current = true;
    const dialog = dialogRef.current;
    dialog?.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      dialog?.close();
      document.body.style.overflow = previousOverflow;
    };
  }, [expanded]);

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let previous = performance.now();
    const tick = (now: number) => {
      const next = timeRef.current + (now - previous) * duration / (PLAYBACK_SECONDS * 1000);
      previous = now;
      const bounded = next >= duration ? 0 : next;
      timeRef.current = bounded;
      setTime(bounded);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [duration, playing]);

  const movement = useMemo(() => positionAt(route, time), [route, time]);
  const width = scenario.operating_area.width;
  const height = scenario.operating_area.height;
  const taskRadius = width / (scenario.tasks.length > 150 ? 260 : 120);

  const changeTime = (next: number) => {
    timeRef.current = next;
    setTime(next);
  };

  const map = <div className="replay-shell">
    <div className="replay-map-wrap">
      <svg className="mission-map animated-mission-map" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${selectedUav} timed mission playback`}>
        <defs><pattern id="replay-grid" width={width / 10} height={height / 10} patternUnits="userSpaceOnUse"><path d={`M ${width / 10} 0 L 0 0 0 ${height / 10}`} fill="none" stroke="rgba(188,236,236,.08)" strokeWidth={width / 500}/></pattern></defs>
        <rect width={width} height={height} fill="url(#replay-grid)"/>
        {plan.uav_routes.flatMap((item) => item.trajectory_segments.map((segment, index) => {
          const selected = item.uav_id === selectedUav;
          const state = time >= segment.end_time ? "completed" : time >= segment.start_time ? "current" : "future";
          return <line key={`${item.uav_id}-${index}`} className={selected ? `replay-route selected ${state}` : "replay-route muted"} x1={segment.start.x} y1={height-segment.start.y} x2={segment.end.x} y2={height-segment.end.y} vectorEffect="non-scaling-stroke"/>;
        }))}
        {scenario.tasks.map((task) => <circle key={task.id} className="replay-task" cx={task.location.x} cy={height-task.location.y} r={taskRadius} vectorEffect="non-scaling-stroke"/>)}
        {scenario.bases.map((base) => <rect key={base.id} className="replay-base" x={base.location.x-width/90} y={height-base.location.y-width/90} width={width/45} height={width/45} vectorEffect="non-scaling-stroke"/>)}
        <g className="moving-uav" transform={`translate(${movement.point.x} ${height-movement.point.y})`}>
          <circle className="uav-pulse" r={width/32}/><circle className="uav-core" r={width/85}/><path d={`M 0 ${-width/55} L ${width/70} ${width/65} L 0 ${width/110} L ${-width/70} ${width/65} Z`} />
        </g>
      </svg>
      <div className="replay-clock"><span>MISSION TIME</span><strong>{fmtTime(time)}</strong><small>{movement.activity}</small>{expandable && <button ref={expanded ? undefined : expandButtonRef} className="map-expand-button" type="button" aria-label={expanded ? "Close expanded map" : "Expand mission map"} onClick={() => setExpanded((value) => !value)}><span aria-hidden="true">{expanded ? "✕" : "⛶"}</span>{expanded ? "Close map" : "Expand map"}</button>}</div>
    </div>
    <div className="replay-controls">
      <button onClick={() => setPlaying((value) => !value)} aria-label={playing ? "Pause UAV playback" : "Play UAV playback"}>{playing ? "Ⅱ" : "▶"}</button>
      <button onClick={() => { setPlaying(false); changeTime(0); }} aria-label="Reset UAV playback">↺</button>
      <input aria-label="Mission time" type="range" min="0" max={duration} step="0.05" value={time} onChange={(event) => { setPlaying(false); changeTime(Number(event.target.value)); }}/>
      <span>{selectedUav}</span><strong>{fmtTime(duration)}</strong>
    </div>
  </div>;

  return <>
    {!expanded && map}
    {expandable && <dialog ref={dialogRef} className="expanded-map-dialog showcase-replay-map" aria-label={`${selectedUav} expanded mission map`} onCancel={() => setExpanded(false)} onClose={() => setExpanded(false)} onKeyDown={(event) => event.stopPropagation()}>
      {expanded && map}
    </dialog>}
  </>;
}

function fmtTime(value: number) {
  const totalSeconds = Math.round(value * 60);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
