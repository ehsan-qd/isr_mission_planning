export type Scale = "small" | "medium" | "large";

export type Benchmark = {
  scenario: string; scale: Scale; number_of_tasks: number; number_of_uavs: number;
  solver: "greedy" | "orbit_hybrid"; status: string; objective_value: number;
  makespan: number; total_distance: number; total_flight_time: number;
  runtime_seconds: number; feasible: boolean; number_of_conflicts: number;
  minimum_separation: number | null; timing: Record<string, number>;
};

export type Waypoint = { label: string; x: number; y: number };
export type Scenario = {
  scenario_id: string;
  metadata: { scale: Scale; seed: number; [key: string]: unknown };
  minimum_separation: number;
  operating_area: { width: number; height: number };
  bases: Array<{ id: string; location: Waypoint }>;
  uavs: Array<{ id: string; home_base_id: string; sensors: string[]; speed: number }>;
  tasks: Array<{ id: string; location: Waypoint; priority: number; required_sensor: string; service_duration: number }>;
};

export type Route = {
  uav_id: string; return_time: number;
  scheduled_tasks: Array<{ task_id: string; start_time: number; finish_time: number }>;
  trajectory_segments: Array<{ start: Waypoint; end: Waypoint; start_time: number; end_time: number; from_id: string; to_id: string }>;
};

export type Plan = {
  scenario_id: string; solver_name: string; mission_start_time: number; mission_end_time: number;
  objective_value: number; uav_routes: Route[];
  task_assignments: Array<{ task_id: string; uav_id: string }>;
  metadata: Record<string, unknown>;
};

export type Conflict = {
  time_of_closest_approach: number; uav_a: string; uav_b: string;
  segment_a: { start: Waypoint; end: Waypoint; start_time: number; end_time: number; from_id: string; to_id: string };
};

export type Validation = {
  feasible: boolean;
  conflicts?: Conflict[];
  issues: Array<{ code: string; message: string; severity: string }>;
  metrics: { makespan: number; total_travel_distance: number; total_flight_time: number; number_of_conflicts: number; minimum_separation: number | null; uav_utilisation: Record<string, number> };
};

export type MissionInstance = {
  seed: number; scenario: Scenario; plan: Plan; validation: Validation;
  benchmarks: { greedy: Benchmark; orbit_hybrid: Benchmark };
};

export type Evidence = {
  generated_at: string;
  evidence_note: string;
  scales: Record<Scale, { label: string; instances: MissionInstance[] }>;
  pdit: {
    formulation_version: string; evidence_status: string;
    outcome: string; repeats: number; samples_per_run: number;
    pbit_best_of_n_success: number; pbit_ground_state_hit_rate: number; pbit_unique_state_fraction: number;
    pdit_best_of_n_success: number; pdit_ground_state_hit_rate: number; pdit_unique_state_fraction: number;
  };
};
