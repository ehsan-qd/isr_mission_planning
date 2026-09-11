/** Loss of Signal: deterministic, browser-only simulation. One grid unit = 100 m. */
export type Point = { x: number; y: number };
export type LinkState = 'GREEN' | 'AMBER' | 'RED';
export type Card = 'CONTINUE' | 'HOLD' | 'CLIMB';
export type Phase = 'BRIEF' | 'PLAN' | 'RUN' | 'INTERRUPT' | 'RECOVERY' | 'DEBRIEF';
export type Sensor = 'EO' | 'IR' | 'RADAR' | 'PAYLOAD';
export type Status = 'OPEN' | 'RESOLVED' | 'FALSE' | 'FAILED';
export type Contact = {
  id: string; pos: Point; label: string; detail: string; persons: number; confidence: number;
  requires: Sensor[]; dwell: number; deadline: number; spawn: number; uncertain: boolean;
  falseContact: boolean; status: Status; actual: Status; observedAt?: number; reportedAt?: number;
};
export type Observation = { contact: string; at: number; status: 'RESOLVED' | 'FALSE'; pos: Point };
export type Order = { objectives: string[]; altitude: 0 | 1 | 2; card: Card; relay: Point | null; rtb: boolean };
export type Airframe = {
  id: string; callsign: string; type: string; color: string; speed: number; endurance: number; fuel: number;
  sensors: Sensor[]; range: number; relayCapable: boolean; payloads: number; quirk: string;
  pos: Point; lastPos: Point; lastSeen: number; lastObjectives: string[]; altitude: 0 | 1 | 2;
  link: LinkState; latency: number; darkSince: number | null; darkLog: Observation[]; darkTrack: Point[];
  objectives: string[]; card: Card; relay: Point | null; pending: { order: Order; due: number } | null;
  mode: 'READY' | 'FLYING' | 'WORKING' | 'HOLDING' | 'RELAY' | 'RTB' | 'LANDED' | 'LOST';
  dwell: number; warnedUntil: number; bingo: boolean; contingencyFired: boolean;
};
export type Notice = { id: number; at: number; kind: 'SIGNAL' | 'LOST_LINK' | 'TELEMETRY' | 'CONTACT' | 'COMPLETE' | 'FUEL' | 'WEATHER' | 'RECOVERY' | 'INFO'; title: string; body: string; aircraft?: string };
export type Snapshot = { time: number; aircraft: { id: string; pos: Point; link: LinkState; mode: Airframe['mode']; lastSeen: number }[]; contacts: { id: string; status: Status }[] };
export type Command = { at: number; aircraft: string; order: Order; delayed: boolean };
export type GameState = {
  seed: number; phase: Phase; time: number; fleet: Airframe[]; contacts: Contact[];
  interrupt: Notice | null; log: Notice[]; history: Snapshot[]; commands: Command[];
  uploads: { aircraft: string; at: number; track: Point[] }[]; eventFlags: string[]; autoPause: boolean; noticeId: number; toast: string;
};
export type Action = { type: 'START' | 'PAUSE' | 'RESUME' | 'RECOVER' } | { type: 'TICK'; steps: number } | { type: 'ORDER'; aircraft: string; order: Order } | { type: 'RESET'; seed?: number } | { type: 'AUTO'; value: boolean };
export const BASE: Point = { x: 13, y: 78 };
export const MAST: Point = { x: 13, y: 64 };
export const SADDLE: Point = { x: 50, y: 47 };
export const DURATION = 900;
export const RECOVERY_AT = 720;
export const STEP = 0.1;
export const ALTITUDES = [150, 460, 1000];
export const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
export const clock = (seconds: number) => `${String(Math.floor(Math.max(0, seconds) / 60)).padStart(2, '0')}:${String(Math.floor(Math.max(0, seconds) % 60)).padStart(2, '0')}`;
export const LINK_COLORS: Record<LinkState, string> = { GREEN: '#9bdfbf', AMBER: '#e9b56c', RED: '#ee7778' };

function elevation(x: number, y: number) {
  const ridgeX = 46 + 5 * Math.sin(y / 18);
  const ridge = 1060 * Math.exp(-(((x - ridgeX) / 6) ** 2));
  const saddle = 0.6 * Math.exp(-(((y - 47) / 8) ** 2));
  const western = 220 * Math.exp(-(((x - 12) / 17) ** 2));
  return 100 + ridge * (1 - saddle) + western + 35 * Math.sin(y / 9) ** 2;
}
export const HEIGHTMAP = Array.from({ length: 64 * 64 }, (_, i) => elevation(i % 64 / 63 * 100, Math.floor(i / 64) / 63 * 100));
export function heightAt(p: Point) { return HEIGHTMAP[Math.max(0, Math.min(63, Math.round(p.y / 100 * 63))) * 64 + Math.max(0, Math.min(63, Math.round(p.x / 100 * 63)))]; }
export type Source = Point & { z: number; range: number; quality: LinkState; id: string };
export function lineOfSight(a: Source, b: Source) {
  // Grid ray traversal samples each crossed heightmap cell at no more than one-cell intervals.
  const steps = Math.max(2, Math.ceil(distance(a, b) / 100 * 64 * 1.5));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (heightAt({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }) > a.z + (b.z - a.z) * t - 15) return false;
  }
  return true;
}
export function smokeAt(time: number): Point {
  return { x: time < 390 ? 83 - time * .065 : 57.65 + (time - 390) * .045, y: 28 + Math.sin(time / 170) * 4 };
}
export function inSmoke(p: Point, time: number) { const s = smokeAt(time); return ((p.x - s.x) / 19) ** 2 + ((p.y - s.y) / 16) ** 2 < 1; }
function sourceFor(u: Airframe, pos = u.pos, altitude = u.altitude): Source { return { ...pos, z: heightAt(pos) + ALTITUDES[altitude], range: u.range, quality: 'GREEN', id: u.id }; }
function edgeQuality(a: Source, b: Source, time: number): LinkState {
  const range = Math.min(a.range, b.range);
  const d = distance(a, b);
  if (d > range || !lineOfSight(a, b)) return 'RED';
  return d > range * .8 || inSmoke(b, time) || inSmoke(a, time) || a.quality === 'AMBER' ? 'AMBER' : 'GREEN';
}
export function linkSources(state: Pick<GameState, 'fleet' | 'time'>): Source[] {
  const sources: Source[] = [{ ...MAST, z: 1400, range: 64, quality: 'GREEN', id: 'mast' }];
  const unlinked = state.fleet.filter(u => u.relayCapable && u.relay && !['READY', 'LANDED', 'LOST'].includes(u.mode) && distance(u.pos, u.relay) < 2);
  // Breadth-first expansion: a relay only extends coverage if it can reach the mast graph.
  for (let hop = 0; hop < state.fleet.length; hop++) {
    let added = false;
    for (const u of unlinked) {
      if (sources.some(s => s.id === u.id)) continue;
      const candidate = sourceFor(u);
      const qualities = sources.map(s => edgeQuality(s, candidate, state.time));
      if (qualities.includes('GREEN') || qualities.includes('AMBER')) { sources.push({ ...candidate, quality: qualities.includes('GREEN') ? 'GREEN' : 'AMBER' }); added = true; }
    }
    if (!added) break;
  }
  return sources;
}
export function linkAt(state: Pick<GameState, 'fleet' | 'time'>, u: Airframe, pos = u.pos, altitude = u.altitude, supplied?: Source[]): LinkState {
  if (distance(pos, BASE) < 2) return 'GREEN';
  const qualities = (supplied ?? linkSources(state)).filter(s => s.id !== u.id).map(s => edgeQuality(s, sourceFor(u, pos, altitude), state.time));
  return qualities.includes('GREEN') ? 'GREEN' : qualities.includes('AMBER') ? 'AMBER' : 'RED';
}
export function compatible(u: Airframe, c: Contact) { return c.requires.some(sensor => u.sensors.includes(sensor) && (sensor !== 'PAYLOAD' || u.payloads > 0)); }
export function activeContacts(state: GameState) { return state.contacts.filter(c => c.spawn <= state.time); }
export function currentOrder(u: Airframe): Order { return u.pending ? structuredClone(u.pending.order) : { objectives: [...(u.link === 'RED' ? u.lastObjectives : u.objectives)], altitude: u.altitude, card: u.card, relay: u.relay ? { ...u.relay } : null, rtb: u.link !== 'RED' && u.mode === 'RTB' }; }
export function initialState(seed = 41): GameState {
  const specs = [
    { id: 'k1', callsign: 'KESTREL–1', type: 'Fixed wing · EO / thermal', color: '#a9d9cf', speed: .25, endurance: 1320, sensors: ['EO', 'IR'] as Sensor[], range: 64, relayCapable: false, payloads: 0, quirk: 'CLEAN AIRFRAME' },
    { id: 'k3', callsign: 'KESTREL–3', type: 'Fixed wing · EO / thermal', color: '#b6b5e7', speed: .25, endurance: 1320, sensors: ['EO', 'IR'] as Sensor[], range: 51.2, relayCapable: false, payloads: 0, quirk: 'FLAKY DATALINK · −20% RANGE' },
    { id: 'helios', callsign: 'HELIOS', type: 'Long endurance · radar / relay', color: '#dfbe78', speed: .139, endurance: 2400, sensors: ['RADAR'] as Sensor[], range: 76, relayCapable: true, payloads: 0, quirk: 'RELAY POD · RADAR OFF WHILE RELAYING' },
    { id: 'mule', callsign: 'MULE', type: 'Multirotor · EO / medkit', color: '#97b9dd', speed: .111, endurance: 840, sensors: ['EO', 'PAYLOAD'] as Sensor[], range: 60, relayCapable: false, payloads: 1, quirk: 'ONE MEDKIT · INJURED CONTACT PRIORITY' },
  ];
  const fleet: Airframe[] = specs.map(s => ({ ...s, fuel: s.endurance, pos: { ...BASE }, lastPos: { ...BASE }, lastSeen: 0, lastObjectives: [], altitude: 0, link: 'GREEN', latency: 0, darkSince: null, darkLog: [], darkTrack: [], objectives: [], card: 'CONTINUE', relay: null, pending: null, mode: 'READY', dwell: 0, warnedUntil: 0, bingo: false, contingencyFired: false }));
  const contacts: Contact[] = [
    { id: 'C-01', pos: { x: 57, y: 59 }, label: 'THE BAROSSA FAMILY', detail: 'Two people sheltering beside a forestry road.', persons: 2, confidence: 1, requires: ['EO', 'IR', 'RADAR'], dwell: 40, deadline: 360, spawn: 0, uncertain: false, falseContact: false, status: 'OPEN', actual: 'OPEN' },
    { id: 'C-02', pos: { x: 39, y: 50 }, label: 'A. MERCER · INJURED', detail: 'Ranger with smoke inhalation. Deliver MULE’s medkit.', persons: 1, confidence: 1, requires: ['PAYLOAD'], dwell: 25, deadline: 450, spawn: 0, uncertain: false, falseContact: false, status: 'OPEN', actual: 'OPEN' },
    { id: 'C-03', pos: { x: 32, y: 76 }, label: 'SOUTH ROAD CREW', detail: 'Three road workers waiting at the valley mouth.', persons: 3, confidence: 1, requires: ['EO', 'IR', 'RADAR'], dwell: 40, deadline: 540, spawn: 0, uncertain: false, falseContact: false, status: 'OPEN', actual: 'OPEN' },
    { id: 'U-04', pos: { x: 75, y: 37 }, label: 'EAST RIDGE RETURN', detail: 'Intermittent return near a disused lookout. Identity unknown.', persons: 3, confidence: .36, requires: ['IR', 'RADAR'], dwell: 55, deadline: 660, spawn: 0, uncertain: true, falseContact: false, status: 'OPEN', actual: 'OPEN' },
    { id: 'U-05', pos: { x: 58, y: 27 }, label: 'UPPER VALLEY HEAT', detail: 'Heat near a recorded burn pile. Could be residual heat.', persons: 0, confidence: .28, requires: ['IR'], dwell: 50, deadline: 600, spawn: 0, uncertain: true, falseContact: true, status: 'OPEN', actual: 'OPEN' },
    { id: 'E-01', pos: { x: 78, y: 63 }, label: 'MINIBUS · FOUR PEOPLE', detail: 'An emergency beacon has activated east of the ridge.', persons: 4, confidence: 1, requires: ['EO', 'IR', 'RADAR'], dwell: 40, deadline: 510, spawn: 180, uncertain: false, falseContact: false, status: 'OPEN', actual: 'OPEN' },
  ];
  // Fixed authored seed: truth is repeatable; replay rewards learning, not random punishment.
  return { seed, phase: 'BRIEF', time: 0, fleet, contacts, interrupt: null, log: [], history: [{ time: 0, aircraft: fleet.map(u => ({ id: u.id, pos: { ...BASE }, link: u.link, mode: u.mode, lastSeen: u.lastSeen })), contacts: contacts.filter(c => c.spawn === 0).map(c => ({ id: c.id, status: c.status })) }], commands: [], uploads: [], eventFlags: [], autoPause: true, noticeId: 0, toast: 'Select an aircraft. Set its route and the orders it will follow when you cannot reach it.' };
}
function notice(s: GameState, kind: Notice['kind'], title: string, body: string, aircraft?: string, interrupt = true) {
  const item = { id: ++s.noticeId, at: s.time, kind, title, body, aircraft };
  s.log.push(item);
  if (s.log.length > 180) s.log.shift();
  if (interrupt && s.autoPause && !s.interrupt) { s.interrupt = item; s.phase = 'INTERRUPT'; }
}
function applyOrder(u: Airframe, order: Order) {
  const preserveDwell = u.objectives[0] === order.objectives[0] && !order.rtb && !order.relay;
  u.objectives = [...order.objectives]; u.altitude = order.altitude; u.card = order.card; u.relay = order.relay ? { ...order.relay } : null;
  if (!preserveDwell) u.dwell = 0; u.contingencyFired = false;
  u.mode = order.rtb ? 'RTB' : order.relay || order.objectives.length ? preserveDwell && u.dwell > 0 ? 'WORKING' : 'FLYING' : u.mode === 'READY' ? 'READY' : 'HOLDING';
  u.lastObjectives = [...u.objectives];
}
function report(s: GameState, observation: Observation) {
  const c = s.contacts.find(c => c.id === observation.contact)!;
  c.status = observation.status; c.confidence = 1; c.observedAt = observation.at; c.reportedAt = s.time;
}
function flush(s: GameState, u: Airframe) {
  if (u.darkTrack.length) { s.uploads = [...s.uploads, { aircraft: u.id, at: s.time, track: [...u.darkTrack] }]; u.darkTrack = []; }
  if (!u.darkLog.length) return;
  const count = u.darkLog.length;
  const oldest = u.darkLog[0].at;
  u.darkLog.forEach(o => report(s, o));
  u.darkLog = [];
  notice(s, 'TELEMETRY', `${u.callsign} / TELEMETRY RECEIVED`, `${count} field report${count === 1 ? '' : 's'} received. Oldest observation ${clock(oldest)}. This information was aboard the aircraft while its link was down.`, u.id);
}
export function targetFor(s: GameState, u: Airframe): Point | null {
  if (u.mode === 'RTB') return BASE;
  if (['LOST', 'LANDED', 'READY', 'HOLDING'].includes(u.mode)) return null;
  if (u.relay) return u.relay;
  return s.contacts.find(c => c.id === u.objectives[0])?.pos ?? null;
}
function stepToward(from: Point, to: Point, amount: number): Point { const d = distance(from, to); const ratio = d === 0 ? 1 : Math.min(1, amount / d); return { x: from.x + (to.x - from.x) * ratio, y: from.y + (to.y - from.y) * ratio }; }
export function routeEstimate(s: GameState, u: Airframe, order = currentOrder(u)) {
  const points = order.rtb ? [BASE] : order.relay ? [order.relay] : order.objectives.map(id => s.contacts.find(c => c.id === id)!.pos);
  let previous = u.link === 'RED' ? u.lastPos : u.pos;
  let time = 0, dark = 0;
  const arrivals: { id: string; at: number; late: boolean }[] = [];
  const ribbon: { a: Point; b: Point; link: LinkState }[] = [];
  const sources = linkSources(s);
  for (let p = 0; p < points.length + 1; p++) {
    const target = points[p] ?? BASE;
    const d = distance(previous, target), count = Math.max(1, Math.ceil(d / 2));
    for (let i = 0; i < count; i++) {
      const a = stepToward(previous, target, d * i / count), b = stepToward(previous, target, d * (i + 1) / count);
      const link = linkAt(s, u, b, order.altitude, sources);
      ribbon.push({ a, b, link });
      if (link === 'RED') dark += d / count / u.speed;
    }
    time += d / u.speed;
    const contact = !order.relay && !order.rtb && p < order.objectives.length ? s.contacts.find(c => c.id === order.objectives[p]) : undefined;
    if (contact) { time += contact.dwell / (order.altitude === 2 && !contact.requires.includes('PAYLOAD') ? .4 : 1); arrivals.push({ id: contact.id, at: s.time + time, late: s.time + time > contact.deadline }); }
    previous = target;
  }
  return { duration: time, homeBeforeClosure: s.time + time < DURATION, recallBy: DURATION - distance(order.relay ?? u.pos, BASE) / u.speed, fuelSafe: time * 1.15 * (order.altitude === 2 ? 1.2 : 1) < u.fuel, dark, arrivals, ribbon };
}
function tickOnce(original: GameState): GameState {
  const s: GameState = { ...original, time: Math.min(DURATION, Math.round((original.time + STEP) * 10) / 10), fleet: original.fleet.map(u => ({ ...u, pos: { ...u.pos }, objectives: [...u.objectives], darkLog: [...u.darkLog], darkTrack: [...u.darkTrack] })), contacts: original.contacts.map(c => ({ ...c })), log: [...original.log], eventFlags: [...original.eventFlags] };
  if (s.time >= 180 && !s.eventFlags.includes('beacon')) { s.eventFlags.push('beacon'); notice(s, 'CONTACT', 'NEW BEACON / EAST OF THE RIDGE', 'Four people in a stranded minibus. Their clock expires at 08:30. Your nearest aircraft may be beyond radio range.'); }
  if (s.time >= 240 && !s.eventFlags.includes('smoke')) { s.eventFlags.push('smoke'); notice(s, 'WEATHER', 'SMOKE OVER THE UPPER VALLEY', 'Forecast plume has arrived. Optical dwell is four times slower inside smoke; thermal and radar remain effective.'); }
  if (s.time >= 390 && !s.eventFlags.includes('wind')) { s.eventFlags.push('wind'); notice(s, 'WEATHER', 'WIND SHIFT / PLUME REVERSING', 'As forecast, smoke is drifting east again. Watch the amber link boundary before sending your next order.'); }
  if (s.time >= RECOVERY_AT && !s.eventFlags.includes('recovery')) { s.eventFlags.push('recovery'); notice(s, 'RECOVERY', 'RECOVERY WINDOW / THREE MINUTES', 'Call your aircraft home. The airspace closes at 15:00; aircraft still airborne will be recorded as lost.'); if (s.phase !== 'INTERRUPT') s.phase = 'RECOVERY'; }
  const sources = linkSources(s);
  for (const u of s.fleet) {
    if (['LOST', 'LANDED'].includes(u.mode)) continue;
    const wasRed = u.link === 'RED';
    u.link = linkAt(s, u, u.pos, u.altitude, sources);
    u.latency = u.link === 'AMBER' ? 12 : 0;
    if (u.link !== 'RED') {
      u.lastPos = { ...u.pos }; u.lastSeen = s.time; u.lastObjectives = [...u.objectives];
      if (wasRed) { u.darkSince = null; flush(s, u); notice(s, 'INFO', `${u.callsign} / LINK RESTORED`, 'Aircraft reachable. Live retasking is available again.', u.id, false); }
      if (u.pending && s.time >= u.pending.due) { applyOrder(u, u.pending.order); u.pending = null; notice(s, 'INFO', `${u.callsign} / ORDER ACKNOWLEDGED`, 'Delayed command received and applied.', u.id, false); }
    } else if (!wasRed) {
      u.darkSince = s.time; u.contingencyFired = false;
      notice(s, 'LOST_LINK', `${u.callsign} / LOSS OF SIGNAL`, `Executing ${u.card === 'CLIMB' ? 'CLIMB FOR LINK' : u.card}. Position is now last known. New orders cannot be transmitted.`, u.id);
    }
    if (u.mode === 'READY') continue;
    if (u.link === 'RED' && Math.round(s.time * 10) % 20 === 0) u.darkTrack.push({ ...u.pos });
    if (u.mode !== 'RTB' && s.time + distance(u.pos, BASE) / u.speed + 35 >= DURATION && !s.eventFlags.includes(`recall-${u.id}`)) {
      s.eventFlags.push(`recall-${u.id}`); notice(s, 'RECOVERY', `${u.callsign} / RETURN WINDOW CLOSING`, 'Recall now to reach base before airspace closure. If the link is down, restore coverage or rely on standing orders.', u.id);
    }
    u.fuel = Math.max(0, u.fuel - STEP * (u.altitude === 2 ? 1.2 : 1));
    if (u.fuel <= 0) { u.mode = 'LOST'; u.link = 'RED'; u.pending = null; notice(s, 'FUEL', `${u.callsign} / AIRFRAME LOST`, 'Endurance exhausted. Untransmitted observations are unrecoverable.', u.id); continue; }
    if (!u.bingo && u.fuel < distance(u.pos, BASE) / u.speed * 1.15 * (u.altitude === 2 ? 1.2 : 1) + 8) {
      u.bingo = true; u.mode = 'RTB'; u.relay = null; u.objectives = []; u.pending = null;
      notice(s, 'FUEL', `${u.callsign} / BINGO FUEL`, 'Automatic return-to-base has priority over all standing orders.', u.id);
    }
    if (u.link === 'RED' && !u.contingencyFired && !u.bingo && u.mode !== 'RTB') {
      u.contingencyFired = true;
      if (u.card === 'HOLD') u.mode = 'HOLDING';
      if (u.card === 'CLIMB') { u.altitude = 2; u.mode = 'HOLDING'; u.relay = null; }
    }
    const target = targetFor(s, u);
    if (target && u.link !== 'RED' && s.time > u.warnedUntil && u.mode !== 'RTB') {
      const predicted = stepToward(u.pos, target, u.speed * 8);
      if (linkAt(s, u, predicted, u.altitude, sources) === 'RED') { u.warnedUntil = s.time + 50; notice(s, 'SIGNAL', `${u.callsign} / SIGNAL FADING`, 'Predicted blackout within 8 seconds. These may be the last orders it hears. Set a contingency or change altitude now.', u.id); }
    }
    if (target) {
      u.pos = stepToward(u.pos, target, u.speed * STEP);
      if (distance(u.pos, target) < .05) {
        if (u.mode === 'RTB') { u.mode = 'LANDED'; u.link = 'GREEN'; u.lastPos = { ...BASE }; u.lastSeen = s.time; flush(s, u); notice(s, 'COMPLETE', `${u.callsign} / HOME SAFE`, `Landed with ${clock(u.fuel)} of endurance remaining.`, u.id); }
        else if (u.relay) u.mode = 'RELAY';
        else {
          const c = s.contacts.find(c => c.id === u.objectives[0]);
          if (c && c.spawn <= s.time) {
            if (c.actual !== 'OPEN') { u.objectives.shift(); u.dwell = 0; }
            else if (compatible(u, c)) {
              u.mode = 'WORKING';
              const opticalOnly = !u.sensors.some(sensor => ['IR', 'RADAR', 'PAYLOAD'].includes(sensor));
              u.dwell += STEP * (u.altitude === 2 && !c.requires.includes('PAYLOAD') ? .4 : 1) * (opticalOnly && inSmoke(u.pos, s.time) ? .25 : 1);
              if (u.dwell >= c.dwell) {
                c.actual = c.falseContact ? 'FALSE' : 'RESOLVED';
                const o: Observation = { contact: c.id, at: s.time, status: c.actual, pos: c.pos };
                if (c.requires.includes('PAYLOAD')) u.payloads--;
                if (u.link === 'RED') u.darkLog.push(o);
                else { report(s, o); notice(s, 'COMPLETE', `${c.id} / ${c.actual === 'FALSE' ? 'FALSE RETURN' : 'CONTACT SECURED'}`, c.actual === 'FALSE' ? 'Residual heat from the burn pile. No people present.' : `${c.label}. ${c.persons} ${c.persons === 1 ? 'person' : 'people'} accounted for.`, u.id); }
                u.objectives.shift(); u.dwell = 0;
              }
            } else { u.objectives.shift(); u.dwell = 0; }
            if (!u.objectives.length) u.mode = 'RTB';
            else if (u.dwell === 0) u.mode = 'FLYING';
          }
        }
      }
    }
  }
  for (const c of s.contacts) {
    if (c.spawn <= s.time && c.deadline <= s.time && c.actual === 'OPEN') {
      c.actual = 'FAILED'; c.status = 'FAILED'; notice(s, 'CONTACT', `${c.id} / WINDOW CLOSED`, `${c.label}. No completed field report before the deadline.`);
    }
  }
  if (Math.floor(s.time * 10) % 50 === 0) s.history = [...s.history, { time: s.time, aircraft: s.fleet.map(u => ({ id: u.id, pos: { ...(u.link === 'RED' ? u.lastPos : u.pos) }, link: u.link, mode: u.mode, lastSeen: u.lastSeen })), contacts: s.contacts.filter(c => c.spawn <= s.time).map(c => ({ id: c.id, status: c.status })) }];
  const allBack = s.fleet.every(u => ['LANDED', 'LOST', 'READY'].includes(u.mode));
  if (s.time >= DURATION || (s.time >= RECOVERY_AT && allBack)) {
    for (const u of s.fleet) if (!['LANDED', 'LOST', 'READY'].includes(u.mode)) { u.mode = 'LOST'; u.link = 'RED'; }
    for (const c of s.contacts) if (c.status === 'OPEN') c.status = 'FAILED';
    s.phase = 'DEBRIEF'; s.interrupt = null;
  }
  return s;
}
export function gameReducer(state: GameState, action: Action): GameState {
  if (action.type === 'RESET') return initialState(action.seed ?? state.seed);
  if (action.type === 'START') return { ...state, phase: 'PLAN' };
  if (action.type === 'AUTO') return { ...state, autoPause: action.value };
  if (action.type === 'PAUSE') return state.phase === 'DEBRIEF' ? state : { ...state, phase: 'PLAN', interrupt: null };
  if (action.type === 'RESUME') return state.phase === 'DEBRIEF' || state.phase === 'BRIEF' ? state : { ...state, phase: state.time >= RECOVERY_AT ? 'RECOVERY' : 'RUN', interrupt: null };
  if (action.type === 'RECOVER') {
    let next = state;
    for (const u of state.fleet.filter(u => !['LOST', 'LANDED', 'READY'].includes(u.mode))) next = gameReducer(next, { type: 'ORDER', aircraft: u.id, order: { ...currentOrder(u), objectives: [], relay: null, rtb: true } });
    return next;
  }
  if (action.type === 'ORDER') {
    if (state.phase === 'DEBRIEF' || state.phase === 'BRIEF') return state;
    const u = state.fleet.find(u => u.id === action.aircraft);
    if (!u || u.link === 'RED' || u.mode === 'LOST' || u.bingo) return { ...state, toast: 'NO UPLINK. This aircraft cannot receive new orders. Reconnect it with a relay or wait for its standing orders.' };
    if (action.order.relay && !u.relayCapable) return { ...state, toast: 'Only HELIOS carries an airborne relay pod.' };
    if (action.order.objectives.some(id => { const c = state.contacts.find(c => c.id === id); return !c || c.spawn > state.time || c.status !== 'OPEN' || !compatible(u, c); })) return { ...state, toast: 'Order rejected: a contact is unavailable or requires a different sensor or payload.' };
    const next = { ...state, fleet: state.fleet.map(item => ({ ...item })), commands: [...state.commands, { at: state.time, aircraft: u.id, order: structuredClone(action.order), delayed: u.link === 'AMBER' }], toast: `${u.callsign}: ${u.link === 'AMBER' ? 'queued · 12-second delivery if link holds' : 'order acknowledged'}.` };
    const edited = next.fleet.find(item => item.id === u.id)!;
    if (u.link === 'AMBER') edited.pending = { order: structuredClone(action.order), due: state.time + 12 };
    else { applyOrder(edited, action.order); edited.pending = null; }
    return next;
  }
  if (action.type === 'TICK') {
    let next = state;
    for (let i = 0; i < Math.min(160, action.steps) && ['RUN', 'RECOVERY'].includes(next.phase); i++) next = tickOnce(next);
    return next;
  }
  return state;
}
export function missionScore(s: GameState) {
  const accounted = s.contacts.filter(c => c.status === 'RESOLVED').reduce((sum, c) => sum + c.persons, 0);
  const intelligence = s.contacts.filter(c => c.status === 'FALSE').length;
  const lost = s.fleet.filter(u => u.mode === 'LOST').length;
  const returned = s.fleet.filter(u => u.mode === 'LANDED').length;
  const margin = Math.round(s.fleet.filter(u => u.mode === 'LANDED').reduce((sum, u) => sum + u.fuel / u.endurance * 10, 0));
  return { accounted, intelligence, lost, returned, score: Math.max(0, accounted * 60 + intelligence * 30 + margin - lost * 120) };
}
export function sequence(s: GameState, u: Airframe, ids: string[]) {
  let remaining = [...ids], pos = u.pos;
  const ordered: string[] = [];
  while (remaining.length) {
    remaining.sort((a, b) => distance(pos, s.contacts.find(c => c.id === a)!.pos) - distance(pos, s.contacts.find(c => c.id === b)!.pos));
    const id = remaining.shift()!; ordered.push(id); pos = s.contacts.find(c => c.id === id)!.pos;
  }
  const cost = (list: string[]) => { let last = u.pos, total = 0; for (const id of list) { const c = s.contacts.find(c => c.id === id)!; total += distance(last, c.pos); last = c.pos; } return total + distance(last, BASE); };
  for (let i = 0; i < ordered.length - 1; i++) for (let j = i + 1; j < ordered.length; j++) { const candidate = [...ordered.slice(0, i), ...ordered.slice(i, j + 1).reverse(), ...ordered.slice(j + 1)]; if (cost(candidate) < cost(ordered)) ordered.splice(0, ordered.length, ...candidate); }
  return ordered;
}
/** Sensor/deadline/fuel-aware insertion planner. Intentionally blind to link and confidence. */
export function propose(s: GameState): Record<string, Order> {
  const orders = Object.fromEntries(s.fleet.filter(u => u.link !== 'RED' && !u.bingo && u.mode !== 'LOST').map(u => [u.id, { ...currentOrder(u), objectives: [] as string[], relay: null, rtb: false }]));
  const unavailable = s.fleet.filter(u => !orders[u.id]).flatMap(u => u.objectives);
  for (const c of activeContacts(s).filter(c => c.status === 'OPEN' && !unavailable.includes(c.id)).sort((a, b) => a.deadline - b.deadline)) {
    let best: { id: string; ids: string[]; cost: number } | undefined;
    for (const u of s.fleet) if (orders[u.id] && compatible(u, c)) {
      for (let i = 0; i <= orders[u.id].objectives.length; i++) {
        const ids = [...orders[u.id].objectives]; ids.splice(i, 0, c.id);
        const estimate = routeEstimate(s, u, { ...orders[u.id], objectives: ids });
        if (!estimate.fuelSafe || estimate.arrivals.some(a => a.late)) continue;
        const baseCost = routeEstimate(s, u, orders[u.id]).duration;
        const cost = estimate.duration - baseCost;
        if (!best || cost < best.cost) best = { id: u.id, ids, cost };
      }
    }
    if (best) orders[best.id].objectives = best.ids;
  }
  return orders;
}
export function runGhost(seed: number) {
  let s = { ...initialState(seed), phase: 'PLAN' as Phase, autoPause: false };
  const orders = propose(s);
  for (const [aircraft, order] of Object.entries(orders)) if (order.objectives.length) s = gameReducer(s, { type: 'ORDER', aircraft, order });
  const optimisticPeople = new Set(Object.values(orders).flatMap(o => o.objectives));
  const optimistic = s.contacts.filter(c => optimisticPeople.has(c.id)).reduce((sum, c) => sum + (c.uncertain ? 3 : c.persons) * 60, 0) + 40;
  s = gameReducer(s, { type: 'RESUME' });
  for (let i = 0; i < DURATION * 10 + 10 && s.phase !== 'DEBRIEF'; i++) s = gameReducer(s, { type: 'TICK', steps: 1 });
  return { state: s, score: missionScore(s), optimistic, orders };
}
