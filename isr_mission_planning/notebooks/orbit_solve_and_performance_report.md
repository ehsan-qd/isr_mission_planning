# ORBIT ISR Mission-Planning Notebook: Technical Report

## Executive summary

The `orbit_solve_and_performance` notebook demonstrates an end-to-end workflow for solving a small ISR task-assignment problem with the local ORBIT SDK simulator. It constructs a geography-aware binary quadratic model (QUBO), samples that QUBO with ORBIT, improves the best raw sample using deterministic local search, decodes the assignment into a scheduled mission plan, validates the plan, and compares the result with both a classical greedy baseline and an independently solved exact QUBO reference.

For the demonstrated `small_seed_42` scenario, containing 16 tasks, 5 UAVs, and 2 bases, raw ORBIT returned a best QUBO energy of **-193.1363**. Deterministic local refinement made three assignment moves and reduced the energy to **-196.9348**, equal to the independently proven QUBO ground-state energy. The resulting hybrid plan was feasible under the project validator, had a makespan of **32.55**, and contained four reported spatial conflicts. The greedy reference was also feasible but had a makespan of **34.67** and five conflicts.

The raw sampling study generated 10,000 samples across five ORBIT runs. None reached the exact ground state. The best raw energy remained -193.1363, an absolute gap of 3.7985 and a relative gap of 1.9288% from the optimum. The correct conclusion is therefore:

> Raw ORBIT did not reach the QUBO ground state in this experiment. ORBIT followed by deterministic local-search post-processing did reach it.

## 1. Aim and scope

The notebook addresses four questions:

1. Can the local ORBIT simulator produce an assignment that can be decoded into a feasible ISR mission plan?
2. How does the hybrid ORBIT result compare with a fast classical greedy baseline?
3. How close is the hybrid result to the globally optimal value of the same assignment QUBO?
4. How frequently does raw ORBIT sampling reach that ground state without local refinement?

The QUBO represents **task-to-UAV assignment**. It does not directly optimize the complete mission schedule. After assignment, task ordering and timing are constructed classically. Spatial conflicts are detected and reported, but they are not constraints in the current QUBO.

## 2. Experimental setup

The notebook generates the deterministic scenario:

```python
scenario = generate_scenario("small", seed=42)
```

This scenario contains:

- 16 ISR tasks;
- 5 UAVs;
- 2 operating bases; and
- sensor-eligibility restrictions determining which UAVs may service each task.

The ORBIT hybrid solver is configured as follows:

```python
config = SolverConfig(
    seed=42,
    orbit_full_sweeps=500,
    orbit_replicas=4,
    orbit_processes=1,
)
```

The local ORBIT SDK `SimulatorSolver` is used rather than ORBIT hardware. The backend parameters include 500 full sweeps, four replicas, one process, beta start 0.5, beta end 4.0, and a beta-step interval of 10. Although the project requests seed 42, ORBIT SDK 0.0.2 does not expose a simulator random-seed parameter through `SolverParams`; consequently, the metadata records `seed_applied=False`.

## 3. QUBO formulation

For each eligible UAV-task pair, the model creates a binary variable

\[
x_{a,t}=\begin{cases}
1 & \text{if UAV }a\text{ is assigned task }t,\\
0 & \text{otherwise.}
\end{cases}
\]

No variable is created when a UAV lacks the sensor required by a task. The solver minimizes

\[
E(x)=x^TQx
     =E_{\mathrm{assign}}+E_{\mathrm{base}}+E_{\mathrm{cluster}}+E_{\mathrm{workload}}.
\]

The matrix is stored in upper-triangular convention, so each off-diagonal coefficient is represented once.

### 3.1 Exactly-one assignment

For each task, the formulation applies

\[
E_{\mathrm{assign}}
=12\sum_t\left[\left(\sum_a x_{a,t}-1\right)^2-1\right].
\]

This term penalizes both unassigned tasks and assignments to more than one UAV. Its weight of 12.0 is deliberately larger than the soft-objective weights so that assignment feasibility dominates the optimization.

### 3.2 Base proximity

The base-proximity term is

\[
E_{\mathrm{base}}
=0.75\sum_{a,t}\widehat{T}^{\mathrm{base}}_{a,t}x_{a,t},
\]

where the coefficient is the normalized travel time from the UAV's home base to the task. This favors assignments requiring less initial transit.

### 3.3 Geographic clustering

For pairs of tasks placed on the same UAV, the formulation includes

\[
E_{\mathrm{cluster}}
=0.25\sum_a\sum_{t<u}\Delta_{a,t,u}x_{a,t}x_{a,u}.
\]

The bounded coefficient is the normalized inter-task travel time:

\[
\Delta_{a,t,u}=\min\!\left(\widehat{T}_a(t,u),1\right).
\]

The coefficient is always non-negative. Nearby co-assigned tasks therefore cost less than distant pairs, but the formulation no longer grants a negative reward for every pair placed on one UAV. That previous reward grew quadratically with task count while a realised route has only a linear number of edges.

### 3.4 Workload balance

The workload term is

\[
E_{\mathrm{workload}}
=1.5\sum_a\left[\left(\sum_t\widehat{b}_{a,t}x_{a,t}-1\right)^2-1\right].
\]

The normalized burden \(\widehat{b}_{a,t}\) combines service duration and estimated base-to-task travel. The normalization makes a total burden near one approximate the target workload for a UAV.

The complete configuration used in the notebook is:

```python
GeographicV2Config(
    assignment_penalty=12.0,
    base_weight=0.75,
    cluster_weight=0.25,
    workload_weight=1.5,
)
```

The generated matrix is held in `encoding.qubo_matrix`, and its variable-to-row mapping is held in `encoding.variable_order`.

## 4. ORBIT hybrid workflow

After QUBO-energy refinement, the decoder repairs any incomplete assignment and sequences each UAV route. A second local-search layer evaluates critical-route moves and swaps against the realised mission makespan rather than the QUBO surrogate. Finally, the independently feasible greedy plan is retained as a makespan safety fallback whenever it is stronger than the refined probabilistic candidate.

The `OrbitHybridSolver` performs the following steps:

1. Encode the scenario as the V2 QUBO.
2. Submit the QUBO matrix to the local ORBIT simulator.
3. Extract ORBIT's best raw state and independently recompute its QUBO energy.
4. Apply deterministic, feasibility-preserving local refinement.
5. Decode the refined assignment into task sequences and mission timings.
6. Validate the resulting mission plan.

The local refinement is post-processing. Starting from the raw ORBIT assignment, it enumerates two kinds of feasible mission-level neighbors:

- reassigning one task to another sensor-eligible UAV; and
- swapping the UAV assignments of two tasks when both swapped assignments remain sensor-compatible.

At each iteration it deterministically selects the neighbor with the lowest QUBO energy. Refinement stops when no neighbor strictly improves the energy. Raw and refined states, energies, runtimes, and the number of moves are stored separately in solver metadata. The implementation deliberately sets `ground_state_claim=False`; equality with a ground state is established only by the independent exact comparison.

## 5. Mission decoding and validation

The refined assignment is converted into a mission plan using deterministic classical scheduling. The validator then checks the constructed plan and reports operational metrics.

For the demonstrated scenario, the hybrid result was:

| Metric | ORBIT hybrid result |
|---|---:|
| Solver status | FEASIBLE |
| Independently validated | Yes |
| Makespan | 32.55 |
| Spatial conflicts reported | 4 |
| Assignment repairs during decoding | 0 |
| Total runtime | 0.249 s |
| ORBIT execution time | 0.248 s |
| Local-search time | approximately 0.001 s |
| Raw ORBIT energy | -193.1363 |
| Refined energy | -196.9348 |
| Local-search moves | 3 |

The notebook also produces three visual diagnostics:

- the unsolved scenario map;
- the decoded ORBIT-hybrid mission map; and
- a Gantt chart of the resulting task schedule.

Spatial conflicts shown by validation are post-hoc warnings. The current formulation does not enforce deconfliction during QUBO optimization.

## 6. Greedy classical baseline

Before invoking the more expensive exact reference, the notebook solves the same scenario with `GreedySolver`. Tasks are ordered by decreasing priority, with task ID used as a deterministic tie-break. Each task is assigned to the eligible UAV with the smallest projected completion-and-return time.

The comparison is:

| Solver | Feasible | Makespan | Conflicts | Runtime |
|---|---:|---:|---:|---:|
| Greedy | Yes | 34.67 | 5 | <0.001 s |
| ORBIT hybrid | Yes | 32.55 | 4 | 0.249 s |

On this instance, the hybrid result reduced makespan by 2.12 time units, approximately 6.1%, and reported one fewer spatial conflict. The greedy result is a fast sanity baseline, not an exact optimizer and not an optimizer of the V2 QUBO energy.

## 7. Independent exact QUBO reference

The notebook constructs the same V2 QUBO independently of the hybrid solver result and passes it to `solve_qubo_exact`. Despite the informal description “brute force,” this function does **not** enumerate every binary state. It linearizes each nonzero product \(x_ix_j\) with an auxiliary binary variable and McCormick constraints, then solves the resulting mixed-integer linear program using SciPy's HiGHS backend.

For the small demonstration:

| Quantity | Energy |
|---|---:|
| Proven exact QUBO ground state | -196.9348 |
| Raw ORBIT result | -193.1363 |
| ORBIT plus local refinement | -196.9348 |
| Hybrid-to-optimum gap | 0.0000 |

Thus, the refined state reached the proven QUBO ground-state energy, while raw ORBIT did not.

The exact cell now has a 15-minute limit:

```python
EXACT_TIME_LIMIT_SECONDS = 15 * 60
exact = solve_qubo_exact(
    encoding,
    time_limit_seconds=EXACT_TIME_LIMIT_SECONDS,
)
```

The cell prints solver status, runtime, proof status, incumbent energy, hybrid energy, and energy gap. A state is reported as reaching the ground state only if HiGHS proves optimality and the energy difference is at most \(10^{-8}\). If the time limit is reached first, the result is labelled the **best MILP incumbent**, and the ground-state comparison is explicitly reported as inconclusive.

This distinction matters at medium scale. For the generated medium seed-42 instance, the QUBO contains 598 assignment variables. Its generic linearization contains 16,239 product variables, 16,837 total MILP variables, and 48,717 constraints. A measured 60-second probe did not prove optimality and retained a 193% MIP gap. Exact proof on that formulation may require many hours or longer, so the 15-minute bound prevents an unbounded notebook run.

## 8. Raw ORBIT sampling experiment

The notebook next bypasses deterministic refinement and measures the raw simulator. It performs five runs with 2,000 requested samples per run:

```python
REPEATS = 5
SAMPLES_PER_RUN = 2000
```

With four replicas, the sampling helper configures 500 sweeps per run, giving 2,000 returned samples. Across all five runs, the notebook independently recalculates every sample's QUBO energy rather than relying only on the SDK-reported minimum.

The aggregate results were:

| Raw-sampling statistic | Result |
|---|---:|
| Runs | 5 |
| Total samples | 10,000 |
| Best energy | -193.1363 |
| Mean energy | -192.7004 |
| Median energy | -193.1363 |
| Exact ground-state samples | 0 |
| Observed hit fraction | 0.00% |
| 95% Wilson interval | 0.00% to 0.04% |
| Unique sampled states | 48 |
| Unique ground states observed | 0 |
| Best absolute energy gap | 3.7985 |
| Best relative energy gap | 1.9288% |

The zero-hit result does not prove that ORBIT can never produce the ground state. It shows that no ground-state sample was observed under the tested simulator configuration and sample budget. The Wilson interval quantifies the uncertainty associated with observing zero successes in 10,000 trials.

## 9. Interpretation

The experiment supports the following conclusions:

1. **The QUBO is operationally usable.** Its refined assignment can be decoded into a feasible mission plan without assignment repair on the demonstrated scenario.
2. **Raw ORBIT gets close but did not solve the instance exactly.** Its best state was about 1.93% above the QUBO ground energy.
3. **The residual error is locally correctable.** Three deterministic task-assignment moves converted the raw state into a ground-state solution in negligible time.
4. **The hybrid attribution is essential.** Ground-state recovery belongs to the combined ORBIT-plus-local-search pipeline, not to raw ORBIT alone.
5. **The hybrid plan outperformed the greedy baseline on the reported operational metrics.** It had a shorter makespan and one fewer detected conflict on this scenario.
6. **Exact proof does not scale like ordinary energy evaluation.** Computing \(x^TQx\) for a candidate is fast, but proving global optimality through the generic MILP linearization becomes difficult on the medium preset.

## 10. Limitations

The notebook has several important limitations:

- It demonstrates detailed results for one small generated scenario; the numerical comparison should not be generalized to all ISR instances without a larger benchmark.
- The QUBO optimizes assignment surrogates, not complete route sequencing, time-window satisfaction, endurance, or spatial deconfliction.
- Scheduling and timing are deterministic classical post-processing.
- Spatial conflicts are reported but are not penalized or prohibited in the QUBO.
- The ORBIT SDK simulator seed cannot be controlled through the installed SDK interface, limiting strict stochastic reproducibility.
- Individual ORBIT samples may not be statistically independent, so the Wilson interval is a useful empirical summary rather than proof of an underlying independent Bernoulli process.
- Reaching the same energy as a proven ground state demonstrates energy optimality, but it does not require the refined binary vector to be the same vector when the QUBO has degenerate ground states.
- When the exact solver reaches its time limit without proof, its incumbent must not be described as the ground state.

## 11. Reproducibility and relevant implementation

The principal artifacts are:

- Notebook: `notebooks/orbit_solve_and_performance.ipynb`
- V2 QUBO: `src/isr_mission_planning/solvers/orbit/encoding_v2.py`
- ORBIT simulator adapter: `src/isr_mission_planning/solvers/orbit/backend.py`
- Hybrid refinement: `src/isr_mission_planning/solvers/orbit/hybrid.py`
- Exact QUBO reference: `src/isr_mission_planning/benchmark/ground_state.py`
- Raw sampling: `src/isr_mission_planning/benchmark/orbit_sampling.py`
- Sample statistics: `src/isr_mission_planning/benchmark/sample_analysis.py`
- Greedy reference: `src/isr_mission_planning/solvers/greedy.py`
- Mission validator: `src/isr_mission_planning/evaluation/validator.py`

The notebook should be run in the project environment with the local ORBIT dependencies installed and the project kernel selected. The QUBO for an executed scenario can be inspected directly with:

```python
Q = np.asarray(encoding.qubo_matrix)
variables = encoding.variable_order
qubo_table = pd.DataFrame(Q, index=variables, columns=variables)
display(qubo_table)
```

## 12. Final conclusion

The notebook establishes a transparent benchmark chain from a generated ISR scenario to a QUBO, from the QUBO to raw ORBIT samples, from the best raw sample to a refined assignment, and from that assignment to a validated mission plan. The small test case shows that the hybrid method can match a proven QUBO optimum and outperform the greedy baseline on makespan, but the sampling evidence also shows that raw ORBIT alone did not reach the ground state in 10,000 observed samples. Future comparisons should retain this separation between raw sampler performance, deterministic post-processing, operational plan quality, and exact optimality certification.
