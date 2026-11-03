import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { advancePlayback, chapterAt, clockLabel, conflictSites, DEMO_CHAPTERS, DEMO_DURATION, missionTimeAt, PLAYBACK_SPEEDS, positionAt, ROADMAP_SETTLED, ROADMAP_START, ROADMAP_STEP, roadmapStepAt, summariseInstance } from "../src/lib/demonstrator.ts";

const evidence = JSON.parse(await readFile(new URL("../public/recorded/mission-evidence.json", import.meta.url), "utf8"));
const instance = evidence.scales.large.instances.find(item => item.seed === 42);
const summary = summariseInstance(instance);

test("the complete story lasts 2:45, with most time dedicated to results", () => {
  assert.equal(DEMO_DURATION, 165);
  assert.equal(clockLabel(DEMO_DURATION), "2:45");
  assert.equal(DEMO_CHAPTERS[0].start, 0);
  assert.equal(DEMO_CHAPTERS.at(-1).end, DEMO_DURATION);
  for (let i = 1; i < DEMO_CHAPTERS.length; i++) assert.equal(DEMO_CHAPTERS[i].start, DEMO_CHAPTERS[i - 1].end);
  assert.ok((DEMO_DURATION - DEMO_CHAPTERS[3].start) / DEMO_DURATION > .6);
  assert.equal(chapterAt(57.99), 2);
  assert.equal(chapterAt(58), 3);
  assert.equal(chapterAt(165), 6);
});

test("playback stops at the end, while repeat preserves overshoot", () => {
  assert.deepEqual(advancePlayback(164.9, .2, false), { seconds: 165, playing: false });
  const repeated = advancePlayback(164.9, .2, true);
  assert.ok(Math.abs(repeated.seconds - .1) < 1e-9);
  assert.equal(repeated.playing, true);
  assert.equal(advancePlayback(23, 0, false).seconds, 23);
  assert.equal(advancePlayback(23, -1, false).seconds, 23);
});

test("fast forward offers 2x, 4x and 8x without skipping the end of the story", () => {
  assert.deepEqual(PLAYBACK_SPEEDS, [1, 2, 4, 8]);
  for (const speed of PLAYBACK_SPEEDS) assert.ok(Math.abs(advancePlayback(10, .25 * speed, false).seconds - (10 + .25 * speed)) < 1e-9);
  assert.deepEqual(advancePlayback(164, .25 * 8, false), { seconds: 165, playing: false });
});

test("narrative facts are calculated from the saved large instance", () => {
  assert.equal(instance.scenario.tasks.length, 300);
  assert.equal(instance.scenario.uavs.length, 40);
  assert.equal(summary.variables, 6385);
  assert.equal(summary.coefficient, "1.2");
  assert.equal(summary.exponent, 373);
  assert.equal(summary.active.length, 25);
  assert.equal(summary.active[0].uav_id, "UAV_34");
  assert.ok(Math.abs(summary.distanceReduction - 56.2) < .1);
  assert.ok(Math.abs(summary.makespanReduction - 13.4) < .1);
  assert.equal(instance.plan.task_assignments.length, 300);
  assert.equal(new Set(instance.plan.task_assignments.map(item => item.task_id)).size, 300);
  for (const assignment of instance.plan.task_assignments) {
    const task = instance.scenario.tasks.find(item => item.id === assignment.task_id);
    const uav = instance.scenario.uavs.find(item => item.id === assignment.uav_id);
    assert.ok(uav.sensors.includes(task.required_sensor));
  }
  assert.equal(instance.validation.feasible, true);
  assert.equal(instance.validation.metrics.number_of_conflicts, 42);
  assert.equal(instance.plan.metadata.hardware_execution, false);
  assert.equal(instance.plan.metadata.seed_applied, false);
});

test("aircraft interpolate travel, hold during collection, and return home", () => {
  for (const route of summary.active) {
    for (const segment of route.trajectory_segments) {
      if (segment.end_time <= segment.start_time) continue;
      const point = positionAt(route, (segment.start_time + segment.end_time) / 2);
      assert.ok(Math.abs(point.x - (segment.start.x + segment.end.x) / 2) < 1e-7);
      assert.ok(Math.abs(point.y - (segment.start.y + segment.end.y) / 2) < 1e-7);
    }
    for (const task of route.scheduled_tasks) {
      const location = instance.scenario.tasks.find(item => item.id === task.task_id).location;
      const point = positionAt(route, (task.start_time + task.finish_time) / 2);
      assert.ok(Math.abs(point.x - location.x) < 1e-7);
      assert.ok(Math.abs(point.y - location.y) < 1e-7);
    }
    assert.deepEqual(positionAt(route, route.return_time + 1), route.trajectory_segments.at(-1).end);
  }
});

test("mission replay reaches completion before each chapter transitions", () => {
  const end = instance.plan.mission_end_time;
  const routeEnd = summary.active[0].return_time;
  assert.equal(missionTimeAt(57, end, routeEnd), 0);
  assert.equal(missionTimeAt(58, end, routeEnd), 0);
  assert.equal(missionTimeAt(85, end, routeEnd), end);
  assert.equal(missionTimeAt(88, end, routeEnd), 0);
  assert.equal(missionTimeAt(116, end, routeEnd), routeEnd);
  assert.equal(missionTimeAt(140, end, routeEnd), end);
  assert.ok(summary.active.every(route => route.scheduled_tasks.every(task => task.finish_time <= end)));
});

test("closing comparison preserves the greedy fallback case", () => {
  const large = evidence.scales.large.instances;
  assert.equal(large.filter(item => item.benchmarks.orbit_hybrid.makespan < item.benchmarks.greedy.makespan).length, 2);
  const fallback = large.find(item => item.seed === 2026);
  assert.equal(fallback.plan.metadata.greedy_fallback_used, true);
  assert.equal(fallback.benchmarks.orbit_hybrid.makespan, fallback.benchmarks.greedy.makespan);
  assert.equal(instance.plan.mission_end_time, instance.benchmarks.orbit_hybrid.makespan);
});

test("the closing roadmap reveals all six extensions before the story ends", () => {
  assert.equal(roadmapStepAt(ROADMAP_START - .01, 6), -1);
  assert.equal(roadmapStepAt(ROADMAP_START, 6), 0);
  assert.equal(roadmapStepAt(ROADMAP_START + ROADMAP_STEP * 5, 6), 5);
  assert.equal(roadmapStepAt(DEMO_DURATION, 6), 5);
  assert.ok(ROADMAP_START >= DEMO_CHAPTERS[6].start);
  assert.ok(ROADMAP_START + ROADMAP_STEP * 5 < ROADMAP_SETTLED && ROADMAP_SETTLED < DEMO_DURATION);
});

test("separation warnings are located from the saved conflicts", () => {
  const sites = conflictSites(instance);
  assert.equal(sites.reduce((sum, site) => sum + site.count, 0), instance.validation.metrics.number_of_conflicts);
  const launches = sites.filter(site => site.atLaunch);
  assert.equal(launches.reduce((sum, site) => sum + site.count, 0), 41);
  for (const site of launches) assert.ok(instance.scenario.bases.some(base => Math.hypot(base.location.x - site.x, base.location.y - site.y) < 1e-6));
});
