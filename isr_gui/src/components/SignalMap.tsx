"use client";

import { useMemo, useRef } from 'react';
import { BASE, MAST, SADDLE, LINK_COLORS, clock, currentOrder, heightAt, linkAt, linkSources, routeEstimate, smokeAt, type Airframe, type GameState, type Point, type Snapshot } from '@/lib/game';

type Props = { state: GameState; selected: string; coverage: boolean; placing: boolean; preview: Point | null; onPreview: (p: Point) => void; onPlace: (p: Point) => void; onSelect: (id: string) => void; onContact: (id: string, remove?: boolean) => void; snapshot?: Snapshot; ghost?: Snapshot; };
export function SignalMap({ state, selected, coverage, placing, preview, onPreview, onPlace, onSelect, onContact, snapshot, ghost }: Props) {
  const svg = useRef<SVGSVGElement>(null);
  const uav = state.fleet.find(u => u.id === selected)!;
  const smoke = smokeAt(snapshot?.time ?? state.time);
  const effectiveTime = snapshot?.time ?? state.time;
  const shownState = useMemo(() => {
    if (!preview || !placing) return state;
    return { ...state, fleet: state.fleet.map(u => u.id === 'helios' ? { ...u, pos: preview, relay: preview, altitude: 2 as const, mode: 'RELAY' as const } : u) };
  }, [state, preview, placing]);
  const cells = useMemo(() => {
    if (!coverage && !placing) return [];
    const sources = linkSources(shownState);
    const coverageUav = placing || uav.relayCapable ? state.fleet[0] : uav;
    return Array.from({ length: 25 * 25 }, (_, i) => {
      const p = { x: i % 25 * 4 + 2, y: Math.floor(i / 25) * 4 + 2 };
      return { ...p, link: linkAt(shownState, coverageUav, p, currentOrder(coverageUav).altitude, sources) };
    });
  }, [shownState, state.fleet, uav, coverage, placing]);
  const ribbons = state.fleet.map(u => ({ u, estimate: routeEstimate(shownState, u) }));
  const screenPoint = (event: React.PointerEvent<SVGSVGElement>): Point => {
    const box = event.currentTarget.getBoundingClientRect();
    return { x: Math.max(3, Math.min(97, (event.clientX - box.left) / box.width * 100)), y: Math.max(3, Math.min(97, (event.clientY - box.top) / box.height * 100)) };
  };
  function aircraftPoint(u: Airframe) { return snapshot?.aircraft.find(a => a.id === u.id)?.pos ?? (u.link === 'RED' ? u.lastPos : u.pos); }
  const telemetry = state.log.filter(n => n.kind === 'TELEMETRY' && state.time - n.at < 10).map(n => n.aircraft);
  return <div className={`los-map ${placing ? 'placing' : ''}`}>
    <svg ref={svg} viewBox="0 0 100 100" preserveAspectRatio="none" role="group" aria-label="Ridgeline operational map. Select aircraft and contacts to assign objectives." onPointerMove={e => { if (placing) onPreview(screenPoint(e)); }} onPointerDown={e => { if (placing) onPlace(screenPoint(e)); }}>
      <defs>
        <pattern id="los-grid" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M10 0H0V10" fill="none" stroke="#9dbaac" strokeOpacity=".09" strokeWidth=".14"/></pattern>
        <pattern id="los-minor-grid" width="2" height="2" patternUnits="userSpaceOnUse"><path d="M2 0H0V2" fill="none" stroke="#b4d4bf" strokeOpacity=".025" strokeWidth=".1"/></pattern>
        <linearGradient id="los-ground" x2="1" y2="1"><stop stopColor="#172824"/><stop offset=".6" stopColor="#13231f"/><stop offset="1" stopColor="#23291f"/></linearGradient>
        <linearGradient id="los-fire" x2="1"><stop stopColor="#dd7e3d" stopOpacity="0"/><stop offset="1" stopColor="#dc6133" stopOpacity=".32"/></linearGradient>
        <filter id="los-paper"><feTurbulence type="fractalNoise" baseFrequency=".8" numOctaves="3" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="linear" slope=".035"/></feComponentTransfer><feBlend in="SourceGraphic" mode="soft-light"/></filter>
        <filter id="los-glow"><feGaussianBlur stdDeviation=".4"/></filter>
      </defs>
      <rect width="100" height="100" fill="url(#los-ground)"/>
      <g aria-hidden="true">
        <path d="M39 -10 Q60 15 45 38 T48 71 T36 112" fill="none" stroke="#77806a" strokeOpacity=".035" strokeWidth="26"/>
        {Array.from({ length: 15 }, (_, i) => <path key={i} d={`M${31 + i * 1.6} -10 Q${58 + i * .8} 15 ${38 + i * 1.1} 38 T${40 + i * 1.15} 71 T${26 + i * 1.35} 112`} fill="none" stroke={i % 4 === 0 ? '#b6b797' : '#84977e'} strokeOpacity={i % 4 === 0 ? '.2' : '.12'} strokeWidth={i % 4 === 0 ? '.22' : '.12'}/>)}
        {Array.from({ length: 8 }, (_, i) => <path key={i} d={`M-10 ${15 + i * 3} Q18 ${2 + i * 2.2} 24 ${18 + i * 2} T30 ${43 + i * 2} T14 ${82 + i * 3}`} fill="none" stroke="#8eac91" strokeOpacity=".09" strokeWidth=".15"/>)}
        {Array.from({ length: 7 }, (_, i) => <ellipse key={i} cx="83" cy="22" rx={9 + i * 2.2} ry={6 + i * 1.4} fill="none" stroke="#9aa786" strokeOpacity=".12" strokeWidth=".15" transform="rotate(-28 83 22)"/>)}
        <path d="M64 -10 C77 13 47 25 62 42 S48 67 60 80 S78 98 70 112" fill="none" stroke="#446b67" strokeOpacity=".25" strokeWidth="1.6"/>
        <path d="M64 -10 C77 13 47 25 62 42 S48 67 60 80 S78 98 70 112" fill="none" stroke="#80a79d" strokeOpacity=".38" strokeWidth=".2"/>
        <path d="M13 78L32 76 44 69 57 59 60 44 75 37 M32 76L30 57 42 47 M57 59L78 63" fill="none" stroke="#bbbc97" strokeOpacity=".3" strokeWidth=".32" strokeDasharray=".9 .5"/>
        <rect width="100" height="100" fill="url(#los-grid)"/><rect width="100" height="100" fill="url(#los-minor-grid)"/>
        <rect width="100" height="100" filter="url(#los-paper)" opacity=".13"/>
        {Array.from({ length: 9 }, (_, i) => <text key={i} x={(i + 1) * 10 + .8} y="3" className="los-map-coordinate">{String((i + 1) * 10).padStart(2, '0')}</text>)}
        <text x="17" y="15" className="los-region">WESTERN HIGH GROUND</text><text x="67" y="15" className="los-region">EAST RIDGE</text><text x="69" y="86" className="los-region">RIDGELINE VALLEY</text><text x="44" y="89" className="los-region" transform="rotate(-80 44 89)">1200 M / RIDGELINE</text>
        <g transform="translate(94 8)"><path d="M0 4V-1M-1.2 .4L0-1 1.2 .4" fill="none" stroke="#b6c5ad" strokeWidth=".25"/><text y="-2.3" textAnchor="middle" className="los-map-coordinate">N</text></g>
      </g>
      {cells.map((c, i) => <rect key={i} x={c.x - 2} y={c.y - 2} width="4" height="4" fill={LINK_COLORS[c.link]} opacity={c.link === 'RED' ? .14 : .1} pointerEvents="none"/>)}
      <g className="los-weather" pointerEvents="none">
        {[240, 480].map(offset => { const p = smokeAt(effectiveTime + offset); return <ellipse key={offset} cx={p.x} cy={p.y} rx="19" ry="16" fill="none" stroke="#c5c1ad" strokeWidth=".18" strokeDasharray="1 .9" opacity=".18"/>; })}
        <ellipse cx={smoke.x} cy={smoke.y} rx="19" ry="16" fill="#b5b4a2" opacity=".07"/>
        <ellipse cx={smoke.x} cy={smoke.y} rx="17" ry="14" fill="#c0bbaa" opacity=".045"/>
        <text x={smoke.x} y={smoke.y - 11} textAnchor="middle" className="los-smoke-label">SMOKE / {effectiveTime < 390 ? '← W' : 'E →'}</text>
        <path d={`M${97 - effectiveTime / 140} -5 Q${90 - effectiveTime / 160} 25 ${97 - effectiveTime / 140} 52 T${94 - effectiveTime / 140} 105 H110V-5Z`} fill="url(#los-fire)"/>
        <path d={`M${97 - effectiveTime / 140} -5 Q${90 - effectiveTime / 160} 25 ${97 - effectiveTime / 140} 52 T${94 - effectiveTime / 140} 105`} fill="none" stroke="#df8754" strokeWidth=".4" strokeDasharray="2 .6" opacity=".7"/>
        <text x="96" y="75" transform="rotate(-90 96 75)" className="los-fire-label">FIRE FRONT / EXCLUSION BOUNDARY</text>
      </g>
      <g transform={`translate(${MAST.x} ${MAST.y})`} aria-label="Western communications mast"><circle r="5" fill="none" stroke="#a9cfb1" strokeOpacity=".15" strokeWidth=".15"/><path d="M-1 2L0-1.8 1 2M-.7 .6H.7M-2-2Q-3 0-2 1M2-2Q3 0 2 1" fill="none" stroke="#b5d6bd" strokeWidth=".3"/><text x="3" y=".3" className="los-feature-label">COMMS MAST</text><text x="3" y="2.6" className="los-feature-sub">1400 M / LIVE</text></g>
      <g transform={`translate(${BASE.x} ${BASE.y})`}><rect x="-2.5" y="-2.5" width="5" height="5" rx=".7" fill="#18352c" stroke="#a9cfb1" strokeWidth=".2"/><path d="M-1.3-.8H1.3V.8H-1.3ZM0-.8V.8" stroke="#d4dfc8" fill="none" strokeWidth=".25"/><text y="5" textAnchor="middle" className="los-feature-label">OPERATIONS BASE</text></g>
      <g transform={`translate(${SADDLE.x} ${SADDLE.y})`} className="los-saddle" role="button" tabIndex={0} aria-label="Station HELIOS at the ridge saddle relay point" onClick={e => { e.stopPropagation(); onPlace(SADDLE); }} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPlace(SADDLE); } }}><rect x="-4" y="-4" width="26" height="8" fill="transparent"/><circle r="3" fill="#142c24" fillOpacity=".8" stroke="#d0b378" strokeWidth=".2" strokeDasharray=".5 .5"/><path d="M0-1.4V1.4M-1.4 0H1.4" stroke="#d0b378" strokeWidth=".25"/><text x="4" y="-.5" className="los-feature-label">THE SADDLE</text><text x="4" y="1.8" className="los-feature-sub">RELAY OPPORTUNITY</text></g>
      {!snapshot && ribbons.map(({ u, estimate }) => <g key={u.id} opacity={u.id === selected ? .95 : .18} pointerEvents="none">{estimate.ribbon.map((seg, i) => <line key={i} x1={seg.a.x} y1={seg.a.y} x2={seg.b.x} y2={seg.b.y} stroke={u.id === selected ? LINK_COLORS[seg.link] : u.color} strokeWidth={u.id === selected ? .6 : .25} strokeDasharray={u.id === selected ? undefined : '1 .8'} />)}{u.id === selected && estimate.dark > 3 && estimate.ribbon.length > 0 && <text x="5" y="95" className="los-dark-label">ROUTE FORECAST / DARK {clock(estimate.dark)}</text>}</g>)}
      {snapshot && state.history.filter(h => h.time <= snapshot.time).filter((_, i) => i % 3 === 0).map(h => h.aircraft.map(a => <circle key={`${h.time}-${a.id}`} cx={a.pos.x} cy={a.pos.y} r=".18" fill={state.fleet.find(u => u.id === a.id)?.color} opacity=".5"/>))}
      {!snapshot && state.uploads.filter(upload => state.time - upload.at < 12).map(upload => <polyline key={`${upload.aircraft}-${upload.at}`} points={upload.track.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke="#f1efda" strokeWidth=".4" className="los-upload-track" pointerEvents="none"/>)}
      {ghost?.aircraft.map(a => <g key={a.id} transform={`translate(${a.pos.x} ${a.pos.y})`} opacity=".45"><path d="M0-1.3L.9 1.2 0 .7-.9 1.2Z" fill="none" stroke="#e4ca91" strokeWidth=".2"/></g>)}
      {state.contacts.filter(c => c.spawn <= effectiveTime).map(c => {
        const status = snapshot?.contacts.find(item => item.id === c.id)?.status ?? c.status;
        const resolved = status === 'RESOLVED' || status === 'FALSE';
        const assigned = state.fleet.find(u => (u.link === 'RED' ? u.lastObjectives : currentOrder(u).objectives).includes(c.id));
        const remaining = Math.max(0, (c.deadline - effectiveTime) / (c.deadline - c.spawn));
        const color = status === 'FAILED' ? '#8f7770' : resolved ? '#8ec5a1' : c.uncertain ? '#b7b2a4' : '#e7ddbe';
        return <g key={c.id} transform={`translate(${c.pos.x} ${c.pos.y})`} role="button" tabIndex={0} aria-label={`${c.id}: ${c.label}, ${c.uncertain && !resolved ? 'unconfirmed' : `${c.persons} people`}, ${status}, requires ${c.requires.join(' or ')}`} className="los-contact-marker" onPointerDown={e => { if (!placing) e.stopPropagation(); }} onClick={e => { if (!placing) { e.stopPropagation(); onContact(c.id); } }} onContextMenu={e => { e.preventDefault(); onContact(c.id, true); }} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onContact(c.id); } }}>
          <title>{`${c.label} · ${c.detail} · deadline ${clock(c.deadline)}`}</title>
          <circle r="4" fill="transparent"/>
          {c.uncertain && !resolved && status !== 'FAILED' && <ellipse rx="6" ry="4" fill="#c6bea7" fillOpacity=".03" stroke={color} strokeWidth=".18" strokeDasharray=".7 .7" transform="rotate(-25)"/>}
          <circle r="2.35" fill="#142722" stroke={color} strokeWidth=".2" opacity=".95"/>
          {!resolved && status !== 'FAILED' && <circle r="2.95" fill="none" stroke={remaining < .18 ? '#f29b79' : color} strokeWidth=".35" strokeDasharray={`${remaining * 18.535} 18.535`} transform="rotate(-90)"/>}
          <text textAnchor="middle" y=".7" className="los-contact-symbol" fill={color}>{status === 'FALSE' ? '∅' : resolved ? '✓' : status === 'FAILED' ? '×' : c.uncertain ? '?' : c.requires.includes('PAYLOAD') ? '+' : c.persons}</text>
          <text textAnchor="middle" y="5.3" className="los-contact-id" fill={color}>{c.id}{assigned ? ` / ${assigned.callsign === 'HELIOS' ? 'H' : assigned.id.toUpperCase()}` : ''}</text>
        </g>;
      })}
      {state.fleet.map((u, i) => {
        const recorded = snapshot?.aircraft.find(a => a.id === u.id);
        const mode = recorded?.mode ?? u.mode, lastSeen = recorded?.lastSeen ?? u.lastSeen;
        const p = aircraftPoint(u); const parked = ['READY', 'LANDED'].includes(mode); const link = recorded?.link ?? u.link;
        const x = parked && !snapshot ? p.x - 4 + i * 2.7 : p.x, y = parked && !snapshot ? p.y - 5 : p.y;
        return <g key={u.id} transform={`translate(${x} ${y})`} role="button" tabIndex={0} aria-label={`Select ${u.callsign}, link ${link}`} onPointerDown={e => { if (!placing) e.stopPropagation(); }} onClick={e => { if (!placing) { e.stopPropagation(); onSelect(u.id); } }} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(u.id); } }} className="los-aircraft-marker">
          <title>{`${u.callsign} · ${mode} · ${link === 'RED' ? `last seen ${clock(lastSeen)}` : 'live position'}`}</title>
          <rect x="-3" y="-3" width={parked ? 6 : 21} height="6" fill="transparent"/>
          {(u.id === selected || telemetry.includes(u.id)) && <circle r="2.6" fill={u.color} fillOpacity=".05" stroke={telemetry.includes(u.id) ? '#fff' : u.color} strokeWidth=".17" strokeDasharray={link === 'RED' ? '.5 .5' : undefined} className={telemetry.includes(u.id) ? 'los-telemetry-pulse' : undefined}/>}
          {mode === 'RELAY' && <circle r="8" fill="none" stroke="#d2b47c" strokeWidth=".15" strokeDasharray="1 1" opacity=".5"/>}
          <path d="M0-1.5L1.4 1.2 0 .55-1.4 1.2Z" fill={link === 'RED' ? '#172722' : u.color} stroke={link === 'RED' ? LINK_COLORS.RED : u.color} strokeWidth=".22"/>
          {!parked && <><text x="3.4" y="-.6" className="los-aircraft-label" fill={u.color}>{u.callsign}</text><text x="3.4" y="1.7" className="los-feature-sub" fill={LINK_COLORS[link]}>{link === 'RED' ? `LAST SEEN ${clock(lastSeen)}` : mode === 'RELAY' ? 'RELAY ACTIVE' : mode}</text></>}
        </g>;
      })}
      {placing && preview && <g transform={`translate(${preview.x} ${preview.y})`} pointerEvents="none"><circle r="4" fill="#dec58d" fillOpacity=".08" stroke="#e8d3a5" strokeWidth=".25" strokeDasharray=".7 .5"/><path d="M-5 0H5M0-5V5" stroke="#e8d3a5" strokeWidth=".15"/><text y="-6" textAnchor="middle" className="los-feature-label">PREVIEW / {Math.round(heightAt(preview))} M</text></g>}
    </svg>
    <div className="los-map-top"><span><i/> LIVE OPERATIONS <b>RIDGELINE / SECTOR 04</b></span><span>10 × 10 KM <span className="los-coordinates">36°42′ N · 118°31′ W / FICTIONAL</span></span></div>
    <div className="los-map-bottom"><span className="los-scale"><i/>1 KM</span><span>{placing ? 'CLICK TO STATION HELIOS · COVERAGE PREVIEW ASSUMES ARRIVAL AT HIGH ALTITUDE' : snapshot ? 'RECORDED TELEMETRY · GOLD OUTLINES = LOCAL PLANNER' : 'SELECT AIRCRAFT → SELECT CONTACT · RIGHT-CLICK TO REMOVE'}</span></div>
  </div>;
}
