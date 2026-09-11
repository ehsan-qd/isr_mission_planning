from __future__ import annotations

from pathlib import Path

from ..models import MissionPlan


def plot_gantt(plan: MissionPlan, output: str | Path) -> Path:
    import matplotlib.pyplot as plt
    from matplotlib.patches import Patch

    height = max(3.5, len(plan.uav_routes) * 0.65)
    figure, axis = plt.subplots(figsize=(11, height))
    for row, route in enumerate(plan.uav_routes):
        for segment in route.trajectory_segments:
            axis.broken_barh([(segment.start_time, segment.end_time - segment.start_time)], (row - 0.35, 0.7), facecolors="#4C78A8")
        for task in route.scheduled_tasks:
            axis.broken_barh([(task.start_time, task.finish_time - task.start_time)], (row - 0.35, 0.7), facecolors="#F58518")
            axis.text((task.start_time + task.finish_time) / 2, row, task.task_id.replace("TASK_", "T"), ha="center", va="center", fontsize=6)
    axis.set_yticks(range(len(plan.uav_routes)), [route.uav_id for route in plan.uav_routes])
    axis.set(xlabel="Mission time", title=f"Schedule: {plan.scenario_id} ({plan.solver_name})")
    axis.axvline(plan.mission_end_time, color="black", linestyle="--", linewidth=1)
    axis.grid(axis="x", alpha=0.2)
    axis.legend(handles=[Patch(color="#4C78A8", label="Travel"), Patch(color="#F58518", label="Task")])
    target = Path(output)
    target.parent.mkdir(parents=True, exist_ok=True)
    figure.tight_layout()
    figure.savefig(target, dpi=160)
    plt.close(figure)
    return target
