from __future__ import annotations

from ..models import TrajectorySegment, Waypoint


def interpolate(segment: TrajectorySegment, time: float) -> Waypoint:
    if time < segment.start_time - 1e-9 or time > segment.end_time + 1e-9:
        raise ValueError("time is outside trajectory segment")
    duration = segment.end_time - segment.start_time
    fraction = 0.0 if duration <= 0 else (time - segment.start_time) / duration
    return Waypoint(
        segment.start.x + fraction * (segment.end.x - segment.start.x),
        segment.start.y + fraction * (segment.end.y - segment.start.y),
    )
