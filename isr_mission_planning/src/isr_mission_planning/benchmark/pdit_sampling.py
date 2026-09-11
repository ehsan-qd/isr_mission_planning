"""Repeated raw native-ORBIT p-dit sampling, mirroring ``orbit_sampling.py``'s p-bit study."""

from __future__ import annotations

import time
from dataclasses import dataclass, field, replace
from typing import Any

from ..models.common import JsonModel
from ..solvers import SolverConfig
from ..solvers.orbit.pdit_backend import OrbitPditSimulatorBackend
from ..solvers.orbit.pdit_encoding import CategoricalAssignmentModel, compute_pdit_energy, decode_one_hot_with_repairs


@dataclass(frozen=True)
class PditSamplingRun(JsonModel):
    repeat: int
    requested_samples: int
    actual_samples: int
    assignments: tuple[dict[str, str], ...]
    independently_audited_energies: tuple[float, ...]
    best_assignment: dict[str, str]
    best_energy: float
    runtime_seconds: float
    backend: str = "SimulatorSolver (MIQPProblem/PDIT)"
    hardware_execution: bool = False
    seed_requested: int = 42
    seed_applied: bool = False
    metadata: dict[str, Any] = field(default_factory=dict)


def run_pdit_sampling(model: CategoricalAssignmentModel, requested_samples: int = 2000, *, repeat: int = 0,
                      config: SolverConfig = SolverConfig()) -> PditSamplingRun:
    if requested_samples <= 0:
        raise ValueError("requested_samples must be positive")
    replicas = min(config.orbit_replicas, requested_samples)
    while requested_samples % replicas:
        replicas -= 1
    sweeps = requested_samples // replicas
    run_config = replace(config, orbit_replicas=replicas, orbit_full_sweeps=sweeps)
    started = time.perf_counter()
    response = OrbitPditSimulatorBackend(run_config).optimise(model)
    runtime = time.perf_counter() - started
    decoded = [decode_one_hot_with_repairs(sample, model) for sample in response.samples]
    assignments = tuple(assignment for assignment, _ in decoded)
    total_repairs = sum(repairs for _, repairs in decoded)
    energies = tuple(compute_pdit_energy(assignment, model) for assignment in assignments)
    best_index = min(range(len(assignments)), key=lambda index: energies[index])
    metadata = dict(response.metadata)
    metadata["sdk_minimum_energy"] = metadata.pop("minimum_miqp_energy")
    metadata["sdk_minimum_energy_audit_agrees"] = abs(metadata["sdk_minimum_energy"] - energies[best_index]) <= 1e-6
    metadata["single_option_task_repairs"] = total_repairs
    return PditSamplingRun(repeat, requested_samples, len(assignments), assignments, energies,
                           assignments[best_index], energies[best_index], runtime,
                           seed_requested=config.seed, seed_applied=False, metadata=metadata)


def repeated_pdit_sampling(model: CategoricalAssignmentModel, requested_samples: int, repeats: int,
                           config: SolverConfig = SolverConfig()) -> list[PditSamplingRun]:
    return [run_pdit_sampling(model, requested_samples, repeat=index, config=config) for index in range(repeats)]
