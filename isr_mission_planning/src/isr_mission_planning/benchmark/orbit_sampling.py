from __future__ import annotations

import time
from dataclasses import dataclass, field, replace
from typing import Any

from ..models.common import JsonModel
from ..solvers import SolverConfig
from ..solvers.orbit.backend import OrbitSdkSimulatorBackend
from ..solvers.orbit.encoding import MissionEncoding
from .energy import compute_qubo_energy


@dataclass(frozen=True)
class OrbitSamplingRun(JsonModel):
    repeat: int
    requested_samples: int
    actual_samples: int
    states: tuple[tuple[int, ...], ...]
    independently_audited_energies: tuple[float, ...]
    best_state: tuple[int, ...]
    best_energy: float
    runtime_seconds: float
    backend: str = "SimulatorSolver"
    hardware_execution: bool = False
    seed_requested: int = 42
    seed_applied: bool = False
    metadata: dict[str, Any] = field(default_factory=dict)


def run_orbit_sampling(encoding: MissionEncoding, requested_samples: int = 2000, *, repeat: int = 0,
                       config: SolverConfig = SolverConfig()) -> OrbitSamplingRun:
    if requested_samples <= 0:
        raise ValueError("requested_samples must be positive")
    replicas = min(config.orbit_replicas, requested_samples)
    while requested_samples % replicas:
        replicas -= 1
    sweeps = requested_samples // replicas
    run_config = replace(config, orbit_replicas=replicas, orbit_full_sweeps=sweeps)
    started = time.perf_counter()
    response = OrbitSdkSimulatorBackend(run_config).optimise(encoding)
    runtime = time.perf_counter() - started
    states = tuple(tuple(sample[name] for name in encoding.variable_order) for sample in response.samples)
    energies = tuple(compute_qubo_energy(state, encoding) for state in states)
    best_index = min(range(len(states)), key=lambda index: energies[index])
    metadata = dict(response.metadata)
    metadata["sdk_minimum_energy"] = metadata.pop("minimum_qubo_energy")
    metadata["sdk_minimum_energy_audit_agrees"] = abs(metadata["sdk_minimum_energy"] - energies[best_index]) <= 1e-8
    return OrbitSamplingRun(repeat, requested_samples, len(states), states, energies, states[best_index], energies[best_index],
                            runtime, seed_requested=config.seed, seed_applied=False, metadata=metadata)


def repeated_orbit_sampling(encoding: MissionEncoding, requested_samples: int, repeats: int,
                            config: SolverConfig = SolverConfig()) -> list[OrbitSamplingRun]:
    return [run_orbit_sampling(encoding, requested_samples, repeat=index, config=config) for index in range(repeats)]


def sample_budget_experiment(encoding: MissionEncoding, budgets: list[int] | tuple[int, ...], repeats: int,
                             config: SolverConfig = SolverConfig()) -> list[OrbitSamplingRun]:
    return [run_orbit_sampling(encoding, budget, repeat=repeat, config=config)
            for budget in budgets for repeat in range(repeats)]
