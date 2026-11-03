import type { MissionInstance, Route } from "./types";

export const DEMO_DURATION = 165;
export const PLAYBACK_SPEEDS = [1, 2, 4, 8] as const;
// The closing chapter reveals one proposed model extension every ROADMAP_STEP seconds.
export const ROADMAP_START = 146;
export const ROADMAP_STEP = 3;
export const ROADMAP_SETTLED = 164;
export const DEMO_CHAPTERS = [
  { start: 0, end: 18, label: "The mission", title: "300 tasks. One coordinated mission." },
  { start: 18, end: 38, label: "The search space", title: "Every assignment changes the mission." },
  { start: 38, end: 58, label: "The method", title: "Sample assignments. Build usable routes." },
  { start: 58, end: 88, label: "The result", title: "Less travel. An earlier finish." },
  { start: 88, end: 119, label: "Follow one UAV", title: "Watch the route that sets the finish." },
  { start: 119, end: 145, label: "The bottleneck", title: "The mission ends with the last aircraft." },
  { start: 145, end: DEMO_DURATION, label: "What's next", title: "Measured today. More realistic next." },
] as const;

export function chapterAt(seconds: number) {
  return Math.max(0, DEMO_CHAPTERS.findLastIndex((chapter) => seconds >= chapter.start));
}

export function advancePlayback(seconds: number, delta: number, loop: boolean) {
  const next = seconds + Math.max(0, delta);
  return { seconds: loop ? next % DEMO_DURATION : Math.min(next, DEMO_DURATION), playing: loop || next < DEMO_DURATION };
}

export function positionAt(route: Route, time: number) {
  const segments = route.trajectory_segments;
  if (!segments.length) return null;
  for (const segment of segments) {
    if (time < segment.start_time) return segment.start;
    if (time <= segment.end_time) {
      const fraction = Math.max(0, Math.min(1, (time - segment.start_time) / Math.max(Number.EPSILON, segment.end_time - segment.start_time)));
      return { x: segment.start.x + fraction * (segment.end.x - segment.start.x), y: segment.start.y + fraction * (segment.end.y - segment.start.y) };
    }
  }
  return segments.at(-1)!.end;
}

export function summariseInstance(instance: MissionInstance) {
  const { scenario, plan, benchmarks } = instance;
  const choices = scenario.tasks.map(task => scenario.uavs.filter(uav => uav.sensors.includes(task.required_sensor)).length);
  const logSpace = choices.reduce((sum, count) => sum + Math.log10(count), 0);
  const active = plan.uav_routes.filter(route => route.scheduled_tasks.length > 0).sort((a, b) => b.return_time - a.return_time);
  return {
    variables: choices.reduce((sum, count) => sum + count, 0),
    coefficient: (10 ** (logSpace - Math.floor(logSpace))).toFixed(1),
    exponent: Math.floor(logSpace), active,
    distanceReduction: 100 * (1 - benchmarks.orbit_hybrid.total_distance / benchmarks.greedy.total_distance),
    makespanReduction: 100 * (1 - benchmarks.orbit_hybrid.makespan / benchmarks.greedy.makespan),
  };
}

export function missionTimeAt(seconds: number, end: number, selectedEnd: number) {
  if (seconds < 58) return 0;
  if (seconds < 88) return Math.min(1, (seconds - 58) / 27) * end;
  if (seconds < 119) return Math.min(1, (seconds - 88) / 28) * selectedEnd;
  return end;
}

export function clockLabel(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

export function roadmapStepAt(seconds: number, count: number) {
  if (seconds < ROADMAP_START) return -1;
  return Math.min(count - 1, Math.floor((seconds - ROADMAP_START) / ROADMAP_STEP));
}

export function conflictSites(instance: MissionInstance) {
  const sites = new Map<string, { x: number; y: number; count: number; atLaunch: boolean }>();
  for (const conflict of instance.validation.conflicts ?? []) {
    const segment = conflict.segment_a;
    const fraction = Math.max(0, Math.min(1, (conflict.time_of_closest_approach - segment.start_time) / Math.max(Number.EPSILON, segment.end_time - segment.start_time)));
    const x = segment.start.x + fraction * (segment.end.x - segment.start.x);
    const y = segment.start.y + fraction * (segment.end.y - segment.start.y);
    const atLaunch = conflict.time_of_closest_approach === 0 && segment.from_id.startsWith("BASE_");
    const key = `${Math.round(x)}:${Math.round(y)}`;
    const site = sites.get(key) ?? { x, y, count: 0, atLaunch };
    site.count += 1;
    sites.set(key, site);
  }
  return Array.from(sites.values());
}
