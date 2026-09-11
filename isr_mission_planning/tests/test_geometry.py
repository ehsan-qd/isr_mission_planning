import pytest

from isr_mission_planning.geometry import euclidean_distance, interpolate, travel_time
from isr_mission_planning.models import TrajectorySegment, Waypoint


def test_distance_travel_and_interpolation():
    a, b = Waypoint(0, 0), Waypoint(3, 4)
    assert euclidean_distance(a, b) == 5
    assert travel_time(a, b, 2) == 2.5
    segment = TrajectorySegment("U1", a, b, 2, 7)
    point = interpolate(segment, 4.5)
    assert point.x == pytest.approx(1.5)
    assert point.y == pytest.approx(2.0)
