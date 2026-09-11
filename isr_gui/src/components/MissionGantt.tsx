import { Plan } from "@/lib/types";

export function MissionGantt({ plan }: { plan: Plan }) {
  const active = plan.uav_routes.filter((route) => route.scheduled_tasks.length > 0);
  return <div className="gantt" aria-label="UAV mission schedule">{active.map((route) => <div className="gantt-row" key={route.uav_id}><strong>{route.uav_id}</strong><div className="gantt-track">{route.scheduled_tasks.map((task) => <span key={task.task_id} style={{ left: `${task.start_time/plan.mission_end_time*100}%`, width: `${Math.max((task.finish_time-task.start_time)/plan.mission_end_time*100,1.5)}%` }} title={`${task.task_id}: ${task.start_time.toFixed(1)}–${task.finish_time.toFixed(1)} min`}/>)}</div><small>{route.return_time.toFixed(1)}m</small></div>)}</div>;
}
