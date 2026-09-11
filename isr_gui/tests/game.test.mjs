import test from 'node:test';
import assert from 'node:assert/strict';
import { SADDLE, currentOrder, gameReducer, initialState, linkAt, missionScore, runGhost } from '../src/lib/game.ts';
const started = () => ({ ...initialState(), phase: 'PLAN', autoPause: false });
function send(s, id, overrides) { return gameReducer(s, { type: 'ORDER', aircraft: id, order: { ...currentOrder(s.fleet.find(u => u.id === id)), ...overrides } }); }
function until(s, time) { s = gameReducer(s, { type: 'RESUME' }); while(s.time < time && s.phase !== 'DEBRIEF') s = gameReducer(s, { type: 'TICK', steps: Math.min(160, Math.round((time-s.time)*10)) }); return s; }

test('the ridge blocks mast coverage; a connected saddle relay restores it', () => {
  const s = started(), contact=s.contacts.find(c=>c.id==='C-01');
  assert.equal(linkAt(s,s.fleet[0],contact.pos),'RED');
  s.fleet[2]={...s.fleet[2],pos:{...SADDLE},relay:{...SADDLE},altitude:2,mode:'RELAY'};
  assert.equal(linkAt(s,s.fleet[0],contact.pos),'GREEN');
  s.fleet[2].pos={x:98,y:2};s.fleet[2].relay={x:98,y:2};
  assert.equal(linkAt(s,s.fleet[0],contact.pos),'RED','an isolated relay cannot create connectivity');
});
test('red aircraft reject changes without mutating state or logging a transmitted order', () => {
  const s=started(); s.fleet[0].link='RED';
  const next=send(s,'k1',{objectives:['C-01']});
  assert.deepEqual(next.fleet[0].objectives,[]);assert.equal(next.commands.length,0);
  assert.match(next.toast,/NO UPLINK/);
});
test('amber orders wait twelve seconds and remain queued through a blackout', () => {
  let s=started();s.fleet[0].link='AMBER';
  s=send(s,'k1',{objectives:['C-01']});
  assert.equal(s.fleet[0].pending.due,12);assert.deepEqual(s.fleet[0].objectives,[]);
  s=until(s,11.9);assert.deepEqual(s.fleet[0].objectives,[]);
  s=until(s,12);assert.deepEqual(s.fleet[0].objectives,['C-01']);assert.equal(s.fleet[0].pending,null);
  let dark=started();dark.fleet[0].link='AMBER';dark=send(dark,'k1',{objectives:['C-01']});
  dark.fleet[0].pos={x:70,y:60};dark=until(dark,13);
  assert.ok(dark.fleet[0].pending);assert.deepEqual(dark.fleet[0].objectives,[]);
});
test('continue records a dark observation without leaking it to operations; landing uploads it', () => {
  let s=send(started(),'k1',{objectives:['C-01']});
  s=until(s,235);
  assert.equal(s.contacts[0].actual,'RESOLVED');assert.equal(s.contacts[0].status,'OPEN');
  assert.equal(s.fleet[0].darkLog.length,1);assert.equal(missionScore(s).accounted,0);
  s=until(s,600);
  assert.equal(s.contacts[0].status,'RESOLVED');assert.equal(s.fleet[0].darkLog.length,0);
  assert.ok(s.contacts[0].reportedAt>s.contacts[0].observedAt);assert.equal(s.fleet[0].mode,'LANDED');
});
test('unrecovered aircraft data never becomes a successful outcome', () => {
  let s=send(started(),'k1',{objectives:['C-01']});s=until(s,235);
  s.fleet[0].fuel=0;s=until(s,236);
  assert.equal(s.fleet[0].mode,'LOST');assert.equal(s.contacts[0].status,'OPEN');
  s=until(s,900);assert.equal(s.contacts[0].status,'FAILED');assert.equal(missionScore(s).accounted,0);
});
test('hold stops movement while dark; climb attempts to regain link and waits', () => {
  for (const card of ['HOLD','CLIMB']) {
    let s=send(started(),'k1',{objectives:['C-01'],card});
    s.fleet[0].pos={x:57,y:59};s=until(s,.1);
    assert.equal(s.fleet[0].mode,'HOLDING');
    const pos={...s.fleet[0].pos};s=until(s,1);
    assert.deepEqual(s.fleet[0].pos,pos);
    if(card==='CLIMB'){assert.equal(s.fleet[0].altitude,2);assert.notEqual(s.fleet[0].link,'RED');}
  }
});
test('bingo fuel overrides hold and forces return; simulation pauses consume no fuel', () => {
  let s=send(started(),'k1',{objectives:['C-01'],card:'HOLD'});s.fleet[0].pos={x:30,y:78};s.fleet[0].fuel=70;
  const frozen=gameReducer(s,{type:'TICK',steps:100});assert.equal(frozen.time,0);assert.equal(frozen.fleet[0].fuel,70);
  s=until(s,.1);assert.equal(s.fleet[0].mode,'RTB');assert.equal(s.fleet[0].bingo,true);
});
test('payload compatibility and hidden future contacts are enforced by the reducer', () => {
  let s=started();s=send(s,'k1',{objectives:['C-02']});assert.deepEqual(s.fleet[0].objectives,[]);
  s=send(s,'k1',{objectives:['E-01']});assert.deepEqual(s.fleet[0].objectives,[]);
  s=send(s,'mule',{objectives:['C-02']});s=until(s,730);
  assert.equal(s.contacts.find(c=>c.id==='C-02').status,'RESOLVED');assert.equal(s.fleet[3].payloads,0);assert.equal(s.fleet[3].mode,'LANDED');
});
test('new beacon interrupts, cannot advance until resumed, and is only visible at spawn time', () => {
  let s={...started(),autoPause:true,time:179.9};s=gameReducer(s,{type:'RESUME'});s=gameReducer(s,{type:'TICK',steps:16});
  assert.equal(s.time,180);assert.equal(s.phase,'INTERRUPT');assert.equal(s.interrupt.kind,'CONTACT');
  assert.equal(gameReducer(s,{type:'TICK',steps:16}).time,180);
});
test('recovery closes the mission and records airborne aircraft as lost', () => {
  let s=send(started(),'helios',{relay:SADDLE,altitude:2});s=until(s,900);
  assert.equal(s.phase,'DEBRIEF');assert.equal(s.fleet[2].mode,'LOST');
});
test('deterministic ghost uses real simulation and includes the medkit assignment', () => {
  const a=runGhost(41),b=runGhost(41);assert.deepEqual(a.score,b.score);assert.deepEqual(a.state.history,b.state.history);
  assert.deepEqual(a.orders.mule.objectives,['C-02']);assert.ok(a.optimistic>a.score.score);
  assert.equal(a.state.contacts.find(c=>c.id==='E-01').status,'FAILED');
});
test('ticks are immutable and batching does not change the simulation outcome', () => {
  const initial=send(started(),'k1',{objectives:['C-01']});const saved=structuredClone(initial);
  const a=until(initial,100);assert.deepEqual(initial,saved);
  let b=gameReducer(initial,{type:'RESUME'});for(let i=0;i<1000;i++)b=gameReducer(b,{type:'TICK',steps:1});
  assert.deepEqual(a,b);
});
test('an adaptive relay strategy can account for all thirteen people and bring every aircraft home', () => {
  let s=started();
  s=send(s,'k1',{objectives:['C-03','C-01']});s=send(s,'k3',{objectives:['U-04','U-05']});
  s=send(s,'mule',{objectives:['C-02']});s=send(s,'helios',{relay:SADDLE,altitude:2});
  s=gameReducer(s,{type:'RESUME'});let diverted=false,recalled=false;
  while(s.phase!=='DEBRIEF'){
    s=gameReducer(s,{type:'TICK',steps:1});const k=s.fleet[0];
    if(s.time>=180&&!diverted&&k.link!=='RED'){s=send(s,'k1',{objectives:[...k.objectives,'E-01'],rtb:false});diverted=true;}
    if(s.time>=500&&!recalled){s=send(s,'helios',{rtb:true,relay:null});recalled=true;}
  }
  assert.equal(missionScore(s).accounted,13);assert.equal(missionScore(s).returned,4);assert.equal(missionScore(s).lost,0);
  assert.ok(missionScore(s).score>runGhost(41).score.score);
});
test('a high-altitude sortie costs more fuel and sensor time than a low sortie', () => {
  let low=send(started(),'k1',{objectives:['C-03'],altitude:0});
  let high=send(started(),'k1',{objectives:['C-03'],altitude:2});
  low=until(low,130);high=until(high,130);
  assert.equal(low.contacts.find(c=>c.id==='C-03').status,'RESOLVED');
  assert.equal(high.contacts.find(c=>c.id==='C-03').status,'OPEN');
  assert.ok(high.fleet[0].fuel<low.fleet[0].fuel);
});
test('editing a contingency preserves work already completed on station', () => {
  let s=send(started(),'k1',{objectives:['C-03']});s=until(s,90);
  const dwell=s.fleet[0].dwell;assert.ok(dwell>0);
  s=send(s,'k1',{card:'HOLD'});assert.equal(s.fleet[0].dwell,dwell);
});
