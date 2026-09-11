# Hardware mission-planning QUBOs

Submit the nine `.mtx` files in the [mtx/](mtx/) subfolder. Each job is named
`<scale>_seed_<seed>_assignment_geographic_v2_qubo.mtx`.
The committed scenarios cover small/medium/large and seeds 42, 101, 2026.
These are scenario-generation seeds; repeated hardware runs sample the same Q.

`manifest.csv` and `manifest.json` list the jobs, matrix dimensions, nonzero
counts, hashes and classical encoding times. Each matrix has a same-stem JSON
sidecar in the parent `q_matrices/` folder with the ordered task/UAV variable mapping and formulation parameters.
`scenarios/` preserves the exact inputs for later benchmarking.

## Matrix convention

The format matches the supplied `JOrig_0000_qubo1.mtx` example:

```
%%MatrixMarket matrix coordinate real general
%
n n nnz
row column coefficient
```

Indices are one-based. Only nonzero entries are written, in row/column order,
with 17 significant digits. Both triangles are explicitly stored. Minimize
`E(x) = x^T Q x` for binary `x` in `{0,1}^n`. The existing encoder stores upper
triangular Q; this export uses `(Q + Q.T)/2`, so each off-diagonal coefficient
is halved and stored twice, and the diagonal is unchanged. Energy is preserved.
There is no rounding to integers, coefficient rescaling, padding, or Ising
conversion. The constant offset is zero, matching the existing energy auditor.
Configure the hardware importer to use this full-matrix binary convention.

The formulation is `assignment_geographic_v2`, version 2.1, with the same
parameters as `OrbitHybridSolver` and the p-bit performance notebook:
assignment penalty 12, base weight 0.75, geographic weight 0.25, workload
weight 1.5, travel burden factor 1, geographic distance cap 1.
It optimizes an assignment surrogate; route sequencing, timing and mission
validation are classical post-processing. QUBO energy and mission makespan
are separate quality measurements.

## Returning hardware results

Keep each result linked to `job_id` and, preferably, `matrix_sha256` in the
manifest. Upload the raw hardware result files, including all sampled binary
states if available, reported energies, sample counts/frequencies, hardware
configuration and any hardware seed. Vector element 0 is matrix index 1;
the sidecar `variable_mapping` gives its task/UAV meaning. If results are
spins, specify the exact spin-to-bit conversion. Record any coefficient
scaling or quantization applied by the hardware service.

For runtime comparisons, provide units and separate hardware sampling time,
programming/setup time, readout time, and total submission-to-result wall time
where available, plus the number of reads and repetitions. Queue/network
latency should be identified separately when measured. Unavailable timings
should be left missing, rather than reported as zero. `encoding_seconds`
measures only the local sparse Q construction, excluding file writing and
verification; it is not a hardware or end-to-end solver runtime.

These records allow later auditing of raw QUBO energy and assignment
feasibility, decoding and validation of mission quality, and comparisons
with classical/simulator results on the same input and objective. Any
assignment repair or hybrid refinement should have its quality and runtime
reported separately from raw hardware output. Exact-optimum claims require
a proven reference for that particular instance.

## Regenerate

From the `isr_mission_planning` project directory:

```bash
.venv/bin/python -m isr_mission_planning export-qubos
```

The command exports every JSON scenario under `data/scenarios` and verifies
every Matrix Market file by reading it back and comparing all coefficients.
It overwrites matching generated files and manifests. Alternative roots:
`--scenario-dir PATH --output-dir PATH`.
