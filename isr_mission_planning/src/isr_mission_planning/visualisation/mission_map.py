from __future__ import annotations

from pathlib import Path

from ..models import MissionPlan, MissionScenario


def plot_scenario(scenario: MissionScenario, output: str | Path | None = None):
    """Plot the unsolved mission; return the figure when no output is supplied."""
    import matplotlib.pyplot as plt

    figure, axis = plt.subplots(figsize=(9, 7))
    sensor_markers = {"EO": "o", "IR": "s", "SAR": "^"}
    for base in scenario.bases:
        axis.scatter(base.location.x, base.location.y, marker="*", s=220, color="black", zorder=5)
        axis.annotate(base.id, (base.location.x, base.location.y), xytext=(5, 5), textcoords="offset points")
    for task in scenario.tasks:
        axis.scatter(task.location.x, task.location.y, marker=sensor_markers[task.required_sensor.value], s=45,
                     label=task.required_sensor.value, alpha=0.8)
        axis.annotate(task.id.replace("TASK_", "T"), (task.location.x, task.location.y), fontsize=7)
    handles, labels = axis.get_legend_handles_labels()
    unique = dict(zip(labels, handles))
    axis.legend(unique.values(), unique.keys(), fontsize=8)
    axis.set(xlabel="x", ylabel="y", title=f"Unsolved mission: {scenario.scenario_id}",
             xlim=(0, scenario.operating_area.width), ylim=(0, scenario.operating_area.height))
    axis.set_aspect("equal", adjustable="box")
    axis.grid(alpha=0.2)
    figure.tight_layout()
    if output is None:
        return figure
    target = Path(output)
    target.parent.mkdir(parents=True, exist_ok=True)
    figure.savefig(target, dpi=160)
    plt.close(figure)
    return target


def plot_mission_map(scenario: MissionScenario, plan: MissionPlan, output: str | Path) -> Path:
    import matplotlib.pyplot as plt

    figure, axis = plt.subplots(figsize=(9, 7))
    sensor_markers = {"EO": "o", "IR": "s", "SAR": "^"}
    for base in scenario.bases:
        axis.scatter(base.location.x, base.location.y, marker="*", s=220, color="black", zorder=5)
        axis.annotate(base.id, (base.location.x, base.location.y), xytext=(5, 5), textcoords="offset points")
    for task in scenario.tasks:
        axis.scatter(task.location.x, task.location.y, marker=sensor_markers[task.required_sensor.value], s=45,
                     label=task.required_sensor.value, alpha=0.8)
        axis.annotate(task.id.replace("TASK_", "T"), (task.location.x, task.location.y), fontsize=7)
    colours = plt.get_cmap("tab10")
    for index, route in enumerate(plan.uav_routes):
        for segment in route.trajectory_segments:
            axis.plot([segment.start.x, segment.end.x], [segment.start.y, segment.end.y], color=colours(index % 10),
                      linewidth=1.5, alpha=0.8)
        if route.trajectory_segments:
            first = route.trajectory_segments[0]
            axis.plot([], [], color=colours(index % 10), label=route.uav_id)
    handles, labels = axis.get_legend_handles_labels()
    unique = dict(zip(labels, handles))
    axis.legend(unique.values(), unique.keys(), fontsize=8, loc="best")
    axis.set(xlabel="x", ylabel="y", title=f"Mission map: {scenario.scenario_id}", xlim=(0, scenario.operating_area.width), ylim=(0, scenario.operating_area.height))
    axis.set_aspect("equal", adjustable="box")
    axis.grid(alpha=0.2)
    target = Path(output)
    target.parent.mkdir(parents=True, exist_ok=True)
    figure.tight_layout()
    figure.savefig(target, dpi=160)
    plt.close(figure)
    return target
