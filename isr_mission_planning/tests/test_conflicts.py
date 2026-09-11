from isr_mission_planning.geometry import detect_conflicts
from isr_mission_planning.models import TrajectorySegment, Waypoint


def segment(uav, start, end, t0, t1):
    return TrajectorySegment(uav, Waypoint(*start), Waypoint(*end), t0, t1)


def test_simultaneous_crossing_conflicts():
    events = detect_conflicts([segment("A", (0, 0), (10, 10), 0, 10), segment("B", (0, 10), (10, 0), 0, 10)], 1)
    assert len(events) == 1
    assert events[0].time_of_closest_approach == 5
    assert events[0].minimum_separation == 0


def test_geometric_crossing_at_different_times_is_safe():
    events = detect_conflicts([segment("A", (0, 0), (10, 10), 0, 10), segment("B", (0, 10), (10, 0), 20, 30)], 1)
    assert not events


def test_parallel_paths_are_safe():
    events = detect_conflicts([segment("A", (0, 0), (10, 0), 0, 10), segment("B", (0, 5), (10, 5), 0, 10)], 2)
    assert not events
