import { Plan, Scenario } from "@/lib/types";

const routeStyles = ["route-a", "route-b", "route-c", "route-d"];

export function MissionMap({ scenario, plan, planned = true }: { scenario: Scenario; plan: Plan; planned?: boolean }) {
  const width = scenario.operating_area.width;
  const height = scenario.operating_area.height;
  const taskRadius = width / (scenario.tasks.length > 150 ? 225 : 100);
  return (
    <svg className="mission-map" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${scenario.scenario_id} mission map`}>
      <defs>
        <pattern id="map-grid" width={width / 10} height={height / 10} patternUnits="userSpaceOnUse"><path d={`M ${width / 10} 0 L 0 0 0 ${height / 10}`} fill="none" stroke="rgba(188,236,236,.1)" strokeWidth={width / 500}/></pattern>
      </defs>
      <rect width={width} height={height} fill="url(#map-grid)" />
      {planned && plan.uav_routes.map((route, routeIndex) => route.trajectory_segments.map((segment, index) => (
        <line key={`${route.uav_id}-${index}`} className={`mission-route ${routeStyles[routeIndex % routeStyles.length]}`} x1={segment.start.x} y1={height-segment.start.y} x2={segment.end.x} y2={height-segment.end.y} vectorEffect="non-scaling-stroke" />
      )))}
      {scenario.tasks.map((task) => <g key={task.id} className="task-point"><circle cx={task.location.x} cy={height-task.location.y} r={taskRadius} vectorEffect="non-scaling-stroke"/><title>{task.id} · {task.required_sensor} · priority {task.priority}</title></g>)}
      {scenario.bases.map((base) => { const rightEdge = base.location.x > width * .78; return <g key={base.id} className="base-point" transform={`translate(${base.location.x} ${height-base.location.y})`}><rect x={-width/70} y={-width/70} width={width/35} height={width/35} vectorEffect="non-scaling-stroke"/><text x={rightEdge ? -width/45 : width/45} y={-width/55} textAnchor={rightEdge ? "end" : "start"}>{base.id}</text></g>; })}
    </svg>
  );
}
