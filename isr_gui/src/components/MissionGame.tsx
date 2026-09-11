"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import Link from 'next/link';
import { SignalMap } from './SignalMap';
import { RECOVERY_AT, SADDLE, activeContacts, clock, compatible, currentOrder, gameReducer, initialState, missionScore, propose, routeEstimate, runGhost, sequence, type Card, type Notice, type Order, type Point } from '@/lib/game';

const CARDS: { id: Card; title: string; icon: string; description: string }[] = [
  { id: 'CONTINUE', title: 'Continue', icon: '↗', description: 'Finish the route, record observations aboard, then return to base.' },
  { id: 'HOLD', title: 'Hold position', icon: '◎', description: 'Stop where the link fails. Wait for new orders; return automatically on bingo fuel.' },
  { id: 'CLIMB', title: 'Climb for link', icon: '↑', description: 'Stop the task, climb to high altitude and await orders. Range can still prevent a link.' },
];
function SignalInterrupt({ notice, resume, plan }: { notice: Notice; resume: () => void; plan: () => void }) {
  const [remaining, setRemaining] = useState(8);
  useEffect(() => {
    if (notice.kind !== 'SIGNAL') return;
    let seconds = 8;
    const timer = window.setInterval(() => { seconds--; setRemaining(seconds); if (seconds <= 0) { window.clearInterval(timer); resume(); } }, 1000);
    return () => window.clearInterval(timer);
  }, [notice.kind, resume]);
  return <section className={`los-interrupt ${notice.kind === 'SIGNAL' ? 'signal' : ''}`} role="alert">
    <div className="los-interrupt-icon">{notice.kind === 'SIGNAL' ? `0:${String(remaining).padStart(2, '0')}` : notice.kind === 'TELEMETRY' ? '↙' : '!'}</div>
    <div><span>{notice.kind === 'SIGNAL' ? 'LAST ORDERS / AUTO-RESUME IN' : 'OPERATIONS INTERRUPT / TIME PAUSED'}</span><h2>{notice.title}</h2><p>{notice.body}</p><div><button onClick={plan}>Stay in planning</button><button onClick={resume}>{notice.kind === 'SIGNAL' ? 'Commit & resume' : 'Acknowledge & resume'} →</button></div></div>
  </section>;
}
function useRadio(enabled: boolean, last: Notice | undefined, context: React.RefObject<AudioContext | null>) {
  useEffect(() => {
    const audio = context.current;
    if (!enabled || !last || !audio || audio.state !== 'running') return;
    const frequencies = last.kind === 'LOST_LINK' ? [160, 95] : last.kind === 'TELEMETRY' || last.title.includes('LINK RESTORED') ? [520, 780] : [650];
    frequencies.forEach((frequency, i) => {
      const oscillator = audio.createOscillator(), gain = audio.createGain();
      oscillator.type = last.kind === 'LOST_LINK' ? 'sawtooth' : 'sine'; oscillator.frequency.value = frequency;
      const at = audio.currentTime + i * .14;
      gain.gain.setValueAtTime(0, at); gain.gain.linearRampToValueAtTime(.035, at + .02); gain.gain.exponentialRampToValueAtTime(.001, at + .16);
      oscillator.connect(gain); gain.connect(audio.destination); oscillator.start(at); oscillator.stop(at + .18);
    });
  }, [enabled, last, context]);
}
export function MissionGame() {
  const [state, dispatch] = useReducer(gameReducer, undefined, () => initialState());
  const [selected, setSelected] = useState('k1');
  const [speed, setSpeed] = useState(4);
  const [coverage, setCoverage] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [preview, setPreview] = useState<Point | null>(null);
  const [help, setHelp] = useState(false);
  const [sound, setSound] = useState(false);
  const [scrub, setScrub] = useState<number | null>(null);
  const [proposal, setProposal] = useState<Record<string, Order> | null>(null);
  const [localMessage, setLocalMessage] = useState('');
  const audio = useRef<AudioContext | null>(null);
  const selectedUav = state.fleet.find(u => u.id === selected)!;
  const order = currentOrder(selectedUav);
  const estimate = routeEstimate(state, selectedUav);
  const locked = selectedUav.link === 'RED' || selectedUav.mode === 'LOST' || selectedUav.bingo || state.phase === 'DEBRIEF';
  const running = state.phase === 'RUN' || state.phase === 'RECOVERY';
  const score = missionScore(state);
  const resume = useCallback(() => dispatch({ type: 'RESUME' }), []);
  const plan = useCallback(() => dispatch({ type: 'PAUSE' }), []);
  useEffect(() => {
    if (!state.interrupt?.aircraft) return;
    const id = state.interrupt.aircraft;
    const frame = requestAnimationFrame(() => { setSelected(id); setPlacing(false); });
    return () => cancelAnimationFrame(frame);
  }, [state.interrupt]);
  const latest = state.log[state.log.length - 1];
  useRadio(sound, latest, audio);
  useEffect(() => { if (!running) return; const timer = window.setInterval(() => dispatch({ type: 'TICK', steps: speed }), 100); return () => window.clearInterval(timer); }, [running, speed]);
  useEffect(() => () => { void audio.current?.close(); }, []);
  const ghost = useMemo(() => state.phase === 'DEBRIEF' ? runGhost(state.seed) : null, [state.phase, state.seed]);
  const replayTime = scrub ?? state.time;
  const snapshot = state.phase === 'DEBRIEF' ? state.history.findLast(h => h.time <= replayTime) : undefined;
  const ghostSnapshot = ghost?.state.history.findLast(h => h.time <= replayTime);

  function send(next: Order) { dispatch({ type: 'ORDER', aircraft: selected, order: next }); setLocalMessage(''); }
  function select(id: string) { setSelected(id); setPlacing(false); setLocalMessage(''); }
  function assign(id: string, remove = false) {
    const c = state.contacts.find(c => c.id === id)!;
    if (state.phase === 'BRIEF' || state.phase === 'DEBRIEF') return;
    if (locked) { setLocalMessage('NO UPLINK. Select a reachable aircraft, or move HELIOS into relay position to regain control.'); return; }
    if (c.status !== 'OPEN') { setLocalMessage(`${c.id}: ${c.status === 'FALSE' ? 'false return — no people present' : c.status.toLowerCase()}.`); return; }
    if (!compatible(selectedUav, c)) { setLocalMessage(`${c.id} requires ${c.requires.join(' / ')}. ${selectedUav.callsign} cannot service this contact.`); return; }
    if (order.objectives.includes(id) || remove) { send({ ...order, objectives: order.objectives.filter(item => item !== id) }); return; }
    const owner = state.fleet.find(u => u.id !== selected && (u.link === 'RED' ? u.lastObjectives : currentOrder(u).objectives).includes(id));
    if (owner) { setLocalMessage(`${c.id} is committed to ${owner.callsign}. Remove it from that aircraft’s route first${owner.link === 'RED' ? ' once its link returns' : ''}.`); return; }
    send({ ...order, objectives: [...order.objectives, id], relay: null, rtb: false });
  }
  function move(index: number, direction: number) { const ids = [...order.objectives]; [ids[index], ids[index + direction]] = [ids[index + direction], ids[index]]; send({ ...order, objectives: ids }); }
  function station(point: Point) {
    if (state.phase === 'BRIEF' || state.phase === 'DEBRIEF') return;
    const helios = state.fleet.find(u => u.id === 'helios')!;
    if (helios.link === 'RED' || helios.bingo) { setLocalMessage('HELIOS is unreachable. Its relay station cannot be changed until the link returns.'); return; }
    dispatch({ type: 'ORDER', aircraft: 'helios', order: { ...currentOrder(helios), objectives: [], relay: point, altitude: 2, rtb: false } });
    setSelected('helios'); setPlacing(false); setPreview(null); setLocalMessage('Relay sortie sent. Coverage expands only after HELIOS reaches its station and connects to the mast.');
  }
  function resequence() { if (!locked) send({ ...order, objectives: sequence(state, selectedUav, order.objectives) }); }
  function openProposal() { if (state.phase === 'BRIEF' || state.phase === 'DEBRIEF') return; plan(); setProposal(propose(state)); }
  function applyProposal() {
    if (!proposal) return;
    for (const [aircraft, next] of Object.entries(proposal)) dispatch({ type: 'ORDER', aircraft, order: next });
    setProposal(null); setLocalMessage('Planner assignments applied. Review the red route ribbon and standing orders before running.');
  }
  function restart() { dispatch({ type: 'RESET' }); setProposal(null); setScrub(null); setSelected('k1'); setPlacing(false); setPreview(null); setLocalMessage(''); }
  useEffect(() => {
    function keyboard(event: KeyboardEvent) {
      if (event.target instanceof HTMLElement && (['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(event.target.tagName) || event.target.isContentEditable)) return;
      if (event.code === 'Space') { event.preventDefault(); dispatch({ type: running ? 'PAUSE' : 'RESUME' }); }
      if (event.key.toLowerCase() === 'c') setCoverage(value => !value);
      if (event.key === 'Escape') { setPlacing(false); setProposal(null); dispatch({ type: 'PAUSE' }); }
      if (event.key.toLowerCase() === 'p') {
        event.preventDefault();
        if (state.phase === 'BRIEF' || state.phase === 'DEBRIEF') return;
        if (event.shiftKey) { dispatch({ type: 'PAUSE' }); setProposal(propose(state)); }
        else if (!locked) dispatch({ type: 'ORDER', aircraft: selected, order: { ...currentOrder(selectedUav), objectives: sequence(state, selectedUav, currentOrder(selectedUav).objectives) } });
      }
    }
    window.addEventListener('keydown', keyboard); return () => window.removeEventListener('keydown', keyboard);
  }, [running, state, selected, selectedUav, locked]);
  async function toggleSound() {
    if (!audio.current) audio.current = new AudioContext();
    if (!sound) await audio.current.resume();
    setSound(!sound);
  }

  return <main className={`los-shell ${state.phase === 'BRIEF' ? 'is-brief' : 'is-active'}`}>
    <header className="los-header"><Link href="/" className="los-brand"><span className="los-brand-icon">◈</span><strong>ORBIT<span>FIELD OPERATIONS</span></strong></Link><div className="los-title"><span>LOSS OF SIGNAL</span><small>A GAME OF COMMITMENT & CONTROL</small></div><div className="los-header-actions"><Link href="/">Exit to showcase ↗</Link><button aria-pressed={sound} onClick={() => void toggleSound()}>{sound ? '◖ Radio on' : '◖ Radio off'}</button><button onClick={() => setHelp(!help)} aria-expanded={help} aria-label="Field guide">?</button></div></header>
    <div className="los-operation-bar"><div><span className="los-status-light"/><strong>CALL-OUT 04</strong><span className="los-bar-divider"/><span>COLD SMOKE</span><small>RIDGELINE VALLEY / WILDFIRE</small></div><span className="los-operation-note">THE AIRCRAFT WILL KEEP FLYING.<br/><b>THE QUESTION IS WHAT IT WILL HEAR.</b></span></div>
    {help && <section className="los-guide"><div><span className="los-kicker">FIELD GUIDE / THE CONTROL PROBLEM</span><h2>Write the order that survives the silence.</h2></div><p>Select a fleet card, then a contact on the map. Green orders apply now; amber orders take 12 simulated seconds and wait if the link drops. Red aircraft follow their contingency and cannot be retasked. Dashed aircraft positions are last known, not live.</p><p>Station HELIOS at the saddle to extend coverage once it arrives. This takes its radar out of service. High altitude helps with terrain, but does not remove radio range limits: it uses 20% more fuel and sensor work takes 2.5× as long. Use the coverage toggle and coloured route ribbon to plan.</p><p>Space: plan/run. C: coverage. P: sequence selected route. Shift-P: propose assignments. Escape: pause. Every contact takes time on station. Smoke slows EO-only aircraft. Return all aircraft before 15:00. Reports recorded in the dark only count when uploaded or brought home.</p><p><b>Scoring:</b> 60 points per person, 30 per false return identified, up to 10 fuel-margin points per returned aircraft, −120 per lost aircraft. The comparator is a local heuristic, not the ORBIT solver.</p><button className="los-small-button" onClick={() => setHelp(false)}>Close field guide ×</button></section>}
    <section className="los-console">
      <div className="los-main-column">
        <div className="los-timebar"><div className="los-clock"><span>MISSION ELAPSED</span><strong>{clock(state.time)}<small>/ 15:00</small></strong></div><div className={`los-phase ${running ? 'live' : ''}`}><i/>{state.phase === 'INTERRUPT' ? 'DECISION REQUIRED' : state.phase === 'BRIEF' ? 'AWAITING DISPATCH' : state.phase === 'PLAN' ? 'PLANNING / PAUSED' : state.phase === 'DEBRIEF' ? 'OPERATION CLOSED' : state.phase === 'RECOVERY' ? 'RECOVERY WINDOW' : 'MISSION LIVE'}</div><div className="los-time-controls"><button aria-label={running ? 'Pause simulation' : 'Run simulation'} className="los-play" disabled={state.phase === 'BRIEF' || state.phase === 'DEBRIEF'} onClick={() => dispatch({ type: running ? 'PAUSE' : 'RESUME' })}>{running ? 'Ⅱ' : '▶'}</button>{[1, 4, 16].map(value => <button key={value} aria-pressed={speed === value} onClick={() => setSpeed(value)}>{value}×</button>)}</div></div>
        <div className="los-map-frame">
          <SignalMap state={state} selected={selected} coverage={coverage} placing={placing} preview={preview} onPreview={setPreview} onPlace={station} onSelect={select} onContact={assign} snapshot={snapshot} ghost={ghostSnapshot}/>
          {state.phase === 'BRIEF' && <div className="los-brief"><div className="los-brief-heading"><span className="los-kicker">INCOMING CALL-OUT / 04</span><span className="los-classification">LOCAL SIMULATION</span></div><h1>Loss of<br/><em>signal.</em></h1><p className="los-brief-lede">Four aircraft. A burning valley.<br/>A radio that cannot reach through rock.</p><div className="los-brief-rule"/><p>Six people are waiting for help. Two more returns are unconfirmed. Your aircraft can cross the ridge. Your orders may not.</p><div className="los-brief-facts"><div><span>YOUR WINDOW</span><strong>15 minutes</strong></div><div><span>YOUR FLEET</span><strong>4 airframes</strong></div><div><span>YOUR ADVANTAGE</span><strong>One relay pod</strong></div></div><div className="los-brief-weather"><span>FORECAST</span><p>Smoke west at 04:00. Wind reversal at 06:30. Residual heat reported at the upper-valley burn pile. New distress calls are possible.</p></div><button className="los-primary" onClick={() => dispatch({ type: 'START' })}>Take control <span>↗</span></button><small>Time pauses for decisions. No aircraft move until you press run.</small></div>}
          {state.interrupt && <SignalInterrupt key={state.interrupt.id} notice={state.interrupt} resume={resume} plan={plan}/>}
          {proposal && <section className="los-proposal"><div className="los-kicker">LOCAL PLANNER / PROPOSED ASSIGNMENTS</div><h2>Efficient routes.<br/>Incomplete assumptions.</h2><p>This heuristic considers sensors, fuel and deadlines. It ignores radio shadows, contact confidence and future distress calls.</p>{Object.entries(proposal).map(([id, next]) => <div className="los-proposal-row" key={id}><strong>{state.fleet.find(u => u.id === id)?.callsign}</strong><span>{next.objectives.join(' → ') || 'No objectives'}</span></div>)}<p className="los-warning">Review any existing relay commitment. Applying a sensing route takes that aircraft off relay duty.</p><div className="los-proposal-actions"><button className="los-small-button" onClick={() => setProposal(null)}>Dismiss</button><button className="los-primary" onClick={applyProposal}>Apply assignments ↗</button></div></section>}
        </div>
        <div className="los-map-toolbar"><div className="los-link-legend"><span><i className="green"/>LIVE</span><span><i className="amber"/>12s DELAY</span><span><i className="red"/>AUTONOMOUS</span></div><button aria-pressed={coverage} onClick={() => setCoverage(!coverage)}><span>▦</span> Link coverage <kbd>C</kbd></button><button disabled={state.phase === 'BRIEF' || state.phase === 'DEBRIEF'} onClick={openProposal}>◇ Planner <kbd>⇧P</kbd></button></div>
        <section className="los-contact-strip"><div className="los-section-label"><span>CONTACT REGISTER</span><small>{activeContacts(state).filter(c => c.status === 'OPEN').length} OPEN / {score.accounted} PEOPLE ACCOUNTED FOR</small></div><div className="los-contact-cards">{activeContacts(state).map(c => {
          const owner = state.fleet.find(u => (u.link === 'RED' ? u.lastObjectives : currentOrder(u).objectives).includes(c.id));
          return <button key={c.id} className={`los-contact-card ${c.status.toLowerCase()} ${c.deadline - state.time < 60 && c.status === 'OPEN' ? 'urgent' : ''}`} onClick={() => assign(c.id)} aria-label={`Assign ${c.id}: ${c.label}`} title={c.detail}><div><b>{c.id}</b><span>{c.status === 'OPEN' ? c.uncertain ? `${Math.round(c.confidence * 100)}% CONF.` : `${c.persons} PEOPLE` : c.status}</span></div><strong>{c.label}</strong><small>{c.status === 'OPEN' ? c.requires.includes('PAYLOAD') ? 'MEDKIT / MULE ONLY' : c.requires.join(' / ') : c.observedAt ? `OBSERVED ${clock(c.observedAt)}` : 'WINDOW CLOSED'}</small><footer><span>{c.status === 'OPEN' ? clock(c.deadline - state.time) : c.status === 'RESOLVED' ? '✓ ACCOUNTED FOR' : c.status === 'FALSE' ? '∅ NO PEOPLE' : '— NOT REACHED'}</span><span>{owner ? owner.callsign : c.status === 'OPEN' ? 'UNASSIGNED' : ''}</span></footer>{c.status === 'OPEN' && <i style={{ width: `${Math.max(0, (c.deadline - state.time) / (c.deadline - c.spawn) * 100)}%` }}/>}</button>;
        })}</div></section>
      </div>
      <aside className="los-sidebar">
        <div className="los-fleet-title"><span>FLEET / 04</span><div><i/>{state.fleet.filter(u => u.link === 'GREEN' && u.mode !== 'LOST').length}<small>/4 LIVE LINKS</small></div></div>
        <div className="los-fleet-list">{state.fleet.map(u => <button className={`los-fleet-card ${u.id === selected ? 'selected' : ''} ${u.link.toLowerCase()}`} key={u.id} aria-pressed={u.id === selected} onClick={() => select(u.id)}><div className="los-fleet-card-top"><span className="los-drone" style={{ color: u.color }}>{u.id === 'mule' ? '✣' : '➤'}</span><div><strong>{u.callsign}</strong><small>{u.type}</small></div><span className={`los-link-dot ${u.link.toLowerCase()}`}/></div><div className="los-fleet-status"><span>{u.mode === 'LOST' ? 'AIRFRAME LOST' : u.link === 'RED' ? `NO SIGNAL · ${clock(state.time - (u.darkSince ?? state.time))}` : u.pending ? `ORDER QUEUED · ${clock(Math.max(0, u.pending.due - state.time))}` : u.mode === 'RELAY' ? 'RELAY ON STATION' : u.mode === 'READY' ? 'ON THE PAD' : u.mode === 'LANDED' ? 'HOME SAFE' : u.link === 'AMBER' ? 'DEGRADED · 12s LATENCY' : u.mode.replace('WORKING', 'ON STATION')}</span><span>{u.link === 'RED' ? 'EST. ' : ''}{Math.round(u.fuel / u.endurance * 100)}%</span></div><div className="los-fuel-track"><i style={{ width: `${u.fuel / u.endurance * 100}%`, background: u.bingo ? '#ecb36e' : u.color }}/></div>{u.link === 'RED' && <div className="los-dark-card">↳ STANDING ORDER: {u.card === 'CLIMB' ? 'CLIMB FOR LINK' : u.card}</div>}</button>)}</div>
        <section className={`los-orders ${locked ? 'locked' : ''}`}><div className="los-section-label"><span>LAST ORDERS / {selectedUav.callsign}</span><span>{locked ? '⊘' : '↗'}</span></div><p className="los-quirk">{selectedUav.quirk}</p>
          {locked && <div className="los-locked-message">{selectedUav.mode === 'LOST' ? 'Airframe lost. Untransmitted telemetry is unrecoverable.' : selectedUav.bingo ? 'Automatic recovery in progress. Fuel reserve overrides retasking.' : state.phase === 'DEBRIEF' ? 'Mission closed. Inspect the telemetry below.' : 'No uplink. Showing the last acknowledged route. Restore coverage to change its orders.'}</div>}
          <div className="los-altitude"><span>ALTITUDE</span><div>{(['Low', 'Mid', 'High'] as const).map((label, index) => <button key={label} aria-pressed={order.altitude === index} disabled={locked || state.phase === 'BRIEF'} onClick={() => send({ ...order, altitude: index as 0 | 1 | 2 })}>{label}</button>)}</div></div>
          <p className="los-altitude-note">{order.altitude === 2 ? "HIGH / +20% fuel · 2.5× sensor dwell" : "LOW & MID / standard fuel and sensor dwell"}</p><div className="los-route-title"><span>{order.relay ? 'RELAY COMMITMENT' : 'OBJECTIVE SEQUENCE'}</span><button disabled={locked || order.objectives.length < 2} onClick={resequence}>Sequence <kbd>P</kbd></button></div>
          {order.relay ? <div className="los-relay-commitment"><span>◎</span><div><strong>Orbit {Math.round(order.relay.x)} / {Math.round(order.relay.y)}</strong><small>Radar unavailable while relaying</small></div></div> : <ol className="los-route">{(selectedUav.link === 'RED' ? selectedUav.lastObjectives : order.objectives).map((id, index) => { const c = state.contacts.find(c => c.id === id)!; const arrival = estimate.arrivals.find(a => a.id === id); return <li key={id}><span>{index + 1}</span><div><strong>{id} <small>{c.label}</small></strong><small className={arrival?.late ? 'late' : ''}>{selectedUav.link === 'RED' ? 'Awaiting telemetry' : `ETA ${clock(arrival?.at ?? state.time)} / due ${clock(c.deadline)}`}</small></div><div className="los-route-actions"><button disabled={locked || index === 0} onClick={() => move(index, -1)} aria-label={`Move ${id} earlier`}>↑</button><button disabled={locked || index === order.objectives.length - 1} onClick={() => move(index, 1)} aria-label={`Move ${id} later`}>↓</button><button disabled={locked} onClick={() => assign(id, true)} aria-label={`Remove ${id}`}>×</button></div></li>; })}{order.objectives.length === 0 && <li className="los-empty-route"><span>＋</span><p>Select a contact on the map.<br/><small>Assignments are sent as you make them.</small></p></li>}</ol>}
          {(order.objectives.length > 0 || order.relay) && <div className="los-route-forecast"><span className={!estimate.fuelSafe || !estimate.homeBeforeClosure ? 'late' : ''}>{estimate.fuelSafe && estimate.homeBeforeClosure ? '✓' : '⚠'} {clock(estimate.duration)} incl. return{order.relay ? ' · no orbit time' : ''}</span><span className={estimate.dark > 0 ? 'late' : ''}>{clock(estimate.dark)} DARK</span><small>{order.relay ? `Leave orbit by ${clock(estimate.recallBy)} to get home before 15:00. ` : !estimate.homeBeforeClosure ? 'This route returns after airspace closure. ' : ''}Current weather & active relays; conditions can change.</small></div>}
          <div className={`los-contingency ${state.interrupt?.kind === 'SIGNAL' && state.interrupt.aircraft === selected ? 'attention' : ''}`}><div className="los-section-label"><span>IF SIGNAL IS LOST</span><span>STANDING ORDER</span></div><div className="los-card-options">{CARDS.map(card => <button key={card.id} disabled={locked || state.phase === 'BRIEF'} aria-pressed={order.card === card.id} title={card.description} onClick={() => send({ ...order, card: card.id })}><span>{card.icon}</span>{card.title}</button>)}</div><p>{CARDS.find(c => c.id === order.card)?.description}</p></div>
          {selectedUav.relayCapable && <div className="los-relay-actions"><button className="los-small-button" disabled={locked || state.phase === 'BRIEF'} onClick={() => { plan(); setPlacing(!placing); setCoverage(true); setPreview(SADDLE); }}>{placing ? 'Cancel placement' : '◎ Place relay orbit'}</button><button className="los-small-button" disabled={locked || state.phase === 'BRIEF'} onClick={() => station(SADDLE)}>Use saddle ↗</button></div>}
          <button className="los-recall" disabled={locked || state.phase === 'BRIEF' || ['READY', 'LANDED'].includes(selectedUav.mode)} onClick={() => send({ ...order, rtb: true, objectives: [], relay: null })}>↙ Return to base</button>
        </section>
        <div className="los-auto-pause"><label><input type="checkbox" checked={state.autoPause} onChange={e => dispatch({ type: 'AUTO', value: e.target.checked })}/> Auto-pause on field events</label><small>Bingo fuel always triggers automatic RTB.</small></div>
      </aside>
    </section>
    <section className="los-dispatch"><span>DISPATCH <i/></span><p role="status">{localMessage || state.toast}</p><div>{state.time >= RECOVERY_AT && state.phase !== 'DEBRIEF' && <button onClick={() => dispatch({ type: 'RECOVER' })}>Recall reachable fleet ↙</button>}<span>{running ? 'SPACE TO PAUSE' : 'SPACE TO RUN'}</span></div></section>
    {state.phase === 'DEBRIEF' && ghost && <section className="los-debrief"><div className="los-debrief-heading"><div><span className="los-kicker">CALL-OUT 04 / AFTER-ACTION REPORT</span><h2>{score.lost > 0 ? 'Not every signal came home.' : 'The valley falls quiet.'}</h2><p>The record is what reached operations. Observations aboard lost aircraft remain unrecovered.</p></div><button className="los-primary" onClick={restart}>Replay the call-out ↗</button></div><div className="los-outcome-numbers"><div><span>PEOPLE ACCOUNTED FOR</span><strong>{score.accounted}<small>/ 13</small></strong></div><div><span>AIRCRAFT RETURNED</span><strong>{score.returned}<small>/ {state.fleet.filter(u => u.mode !== 'READY').length} launched</small></strong></div><div><span>YOUR RESULT</span><strong>{score.score}<small>points</small></strong></div><div><span>PLANNER / SIMULATED</span><strong>{ghost.score.score}<small>points</small></strong></div><div><span>PLANNER / OPTIMISTIC</span><strong>{ghost.optimistic}<small>points</small></strong></div></div><div className="los-replay"><label htmlFor="los-replay-time">TELEMETRY REPLAY <strong>{clock(replayTime)}</strong></label><input id="los-replay-time" type="range" min="0" max={state.time} step="5" value={replayTime} onChange={e => setScrub(Number(e.target.value))}/><div className="los-timeline-notches">{state.log.filter(n => n.kind !== 'INFO').map(n => <i key={n.id} style={{ left: `${n.at / state.time * 100}%` }} title={`${clock(n.at)} ${n.title}`}/>)}</div><p>Scrub to inspect the map. Your recovered position history is dotted; the local planner appears as gold outlines. Blackouts preserve the last reported position.</p></div><div className="los-outcomes">{state.contacts.map(c => <div key={c.id}><span>{c.id}</span><strong>{c.label}</strong><span className={c.status === 'RESOLVED' || c.status === 'FALSE' ? 'success' : 'late'}>{c.status === 'RESOLVED' ? 'ACCOUNTED FOR' : c.status === 'FALSE' ? 'FALSE RETURN' : 'NOT REACHED'}</span><small>{c.observedAt !== undefined ? `OBS ${clock(c.observedAt)} / RX ${clock(c.reportedAt ?? c.observedAt)}` : 'NO RECOVERED REPORT'}</small></div>)}{state.fleet.filter(u => u.mode === 'LOST').map(u => <div key={u.id}><span>AIR</span><strong>{u.callsign}</strong><span className="late">AIRFRAME LOST</span><small>TELEMETRY UNRECOVERED</small></div>)}</div><p className="los-comparison-note">The local planner makes one assignment at dispatch and never retasks. Its optimistic forecast assumes all assigned uncertain contacts contain three people, every observation uploads and all aircraft return. The simulated result uses the same terrain, link, fuel, contact truth and weather rules as your mission. Neither result uses the real ORBIT solver.</p></section>}
    <section className="los-radio-log"><div className="los-section-label"><span>OPERATIONS LOG</span><small>{state.commands.length} ORDERS TRANSMITTED</small></div>{state.log.length ? [...state.log].reverse().slice(0, 6).map(item => <div key={item.id}><time>{clock(item.at)}</time><span className={item.kind === 'LOST_LINK' || item.kind === 'SIGNAL' ? 'late' : ''}>{item.title}</span><p>{item.body}</p></div>) : <div><time>00:00</time><span>OPERATIONS / STANDING BY</span><p>Western mast online. Forecast received. All four airframes ready for dispatch.</p></div>}</section>
    <footer className="los-footer"><span>ORBIT / LOSS OF SIGNAL</span><span>FICTIONAL DISASTER RESPONSE · BROWSER SIMULATION · NO LIVE SOLVER</span><Link href="/presentation">Mission planning briefing ↗</Link></footer>
  </main>;
}
