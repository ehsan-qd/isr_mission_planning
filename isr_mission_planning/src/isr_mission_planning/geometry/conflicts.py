"""Exact closest approach for pairs of simultaneous linear segments."""

from __future__ import annotations

import math
from itertools import combinations

from ..models import ConflictEvent, TrajectorySegment
from .trajectories import interpolate


def _closest_approach(a: TrajectorySegment, b: TrajectorySegment) -> tuple[float, float] | None:
    start, end = max(a.start_time, b.start_time), min(a.end_time, b.end_time)
    if end < start - 1e-12:
        return None
    pa, pb = interpolate(a, start), interpolate(b, start)

    def velocity(segment: TrajectorySegment) -> tuple[float, float]:
        duration = segment.end_time - segment.start_time
        return (0.0, 0.0) if duration <= 0 else (
            (segment.end.x - segment.start.x) / duration,
            (segment.end.y - segment.start.y) / duration,
        )

    va, vb = velocity(a), velocity(b)
    rx, ry = pa.x - pb.x, pa.y - pb.y
    vx, vy = va[0] - vb[0], va[1] - vb[1]
    denominator = vx * vx + vy * vy
    offset = 0.0 if denominator <= 1e-15 else max(0.0, min(end - start, -(rx * vx + ry * vy) / denominator))
    distance = math.hypot(rx + vx * offset, ry + vy * offset)
    return start + offset, distance


def detect_conflicts(
    segments: list[TrajectorySegment] | tuple[TrajectorySegment, ...], minimum_separation: float,
) -> tuple[ConflictEvent, ...]:
    events: list[ConflictEvent] = []
    by_uav: dict[str, list[TrajectorySegment]] = {}
    for segment in segments:
        by_uav.setdefault(segment.uav_id, []).append(segment)
    for uav_a, uav_b in combinations(sorted(by_uav), 2):
        for segment_a in by_uav[uav_a]:
            for segment_b in by_uav[uav_b]:
                result = _closest_approach(segment_a, segment_b)
                if result is None:
                    continue
                time, separation = result
                if separation < minimum_separation - 1e-9:
                    events.append(ConflictEvent(
                        uav_a, uav_b, time, separation, segment_a, segment_b,
                        "critical" if separation < minimum_separation * 0.5 else "warning",
                    ))
    return tuple(sorted(events, key=lambda event: (event.time_of_closest_approach, event.uav_a, event.uav_b)))


def minimum_pairwise_separation(segments: list[TrajectorySegment] | tuple[TrajectorySegment, ...]) -> float | None:
    minimum: float | None = None
    for a, b in combinations(segments, 2):
        if a.uav_id == b.uav_id:
            continue
        result = _closest_approach(a, b)
        if result is not None:
            minimum = result[1] if minimum is None else min(minimum, result[1])
    return minimum
