# Performance notebooks

- `orbit_solve_and_performance.ipynb`: p-bit assignment formulation, exact MILP
  reference, raw sampling reliability, and mission-level greedy comparison.
- `orbit_pdit_solve_and_performance.ipynb`: categorical formulation, exact reference,
  sampling reliability, and p-bit/p-dit comparison.
- `orbit_solve_and_performance_report.md`: saved interpretation of an earlier run.

The notebooks contain saved outputs that can be read without installing ORBIT.
Their measurements are historical local simulator results, not expected results
for every run or evidence of hardware advantage.

To execute, follow [optional ORBIT setup](../README.md#orbit-setup), then launch
from `isr_mission_planning/`:

```bash
uv run --no-sync jupyter lab
```

Select the project kernel. To execute a fresh copy without replacing saved evidence:

```bash
uv run --no-sync jupyter nbconvert --to notebook --execute notebooks/orbit_solve_and_performance.ipynb --output-dir outputs/notebooks
```

The notebooks also write benchmark artifacts under `outputs/benchmark/`. These
are ignored by Git. Native solver runs can be expensive and stochastic: the SDK
used for the recorded evidence does not apply the requested sampling seed.
Review formulation versions before replacing the GUI's historical p-dit evidence.
