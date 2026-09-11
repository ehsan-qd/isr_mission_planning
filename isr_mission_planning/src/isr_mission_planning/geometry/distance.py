from __future__ import annotations

import math

from ..models import Waypoint


def euclidean_distance(a: Waypoint, b: Waypoint) -> float:
    return math.hypot(b.x - a.x, b.y - a.y)


def travel_time(a: Waypoint, b: Waypoint, speed: float) -> float:
    if speed <= 0:
        raise ValueError("UAV speed must be positive")
    return euclidean_distance(a, b) / speed
