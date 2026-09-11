from __future__ import annotations

import math
from collections import Counter
from dataclasses import dataclass
from typing import Sequence

from ..models.common import JsonModel
from ..solvers.orbit.encoding import MissionEncoding
from .energy import compute_qubo_energy


@dataclass(frozen=True)
class SampleSummary(JsonModel):
    number_of_samples: int
    ground_state_samples: int
    ground_state_sample_fraction: float
    confidence_interval_95: tuple[float, float]
    unique_states: int
    unique_ground_states_observed: int
    best_energy: float
    mean_energy: float
    median_energy: float
    absolute_gap: float
    relative_gap: float | None


def energy_gap(candidate: float, reference: float, epsilon: float = 1e-12) -> tuple[float, float | None]:
    absolute = float(candidate - reference)
    relative = None if abs(reference) <= epsilon else absolute / abs(reference)
    return absolute, relative


def wilson_interval(successes: int, trials: int, z: float = 1.959963984540054) -> tuple[float, float]:
    if trials <= 0:
        return 0.0, 0.0
    p = successes / trials
    denominator = 1.0 + z * z / trials
    centre = (p + z * z / (2 * trials)) / denominator
    radius = z * math.sqrt(p * (1 - p) / trials + z * z / (4 * trials * trials)) / denominator
    return max(0.0, centre - radius), min(1.0, centre + radius)


def assignment_violations(state: Sequence[int], encoding: MissionEncoding) -> tuple[str, ...]:
    values = dict(zip(encoding.variable_order, state, strict=True))
    violations: list[str] = []
    for constraint in encoding.constraints:
        active = sum(int(values[name]) for name in constraint.variables)
        task_id = constraint.name.split("::", 1)[1]
        if active == 0:
            violations.append(f"unassigned:{task_id}")
        elif active > 1:
            violations.append(f"duplicate:{task_id}")
    return tuple(violations)


def summarise_samples(states: Sequence[Sequence[int]], encoding: MissionEncoding, ground_energy: float, tolerance: float = 1e-8) -> SampleSummary:
    if not states:
        raise ValueError("At least one sample is required")
    state_tuples = [tuple(int(bit) for bit in state) for state in states]
    energies = [compute_qubo_energy(state, encoding) for state in state_tuples]
    hits = sum(abs(energy - ground_energy) <= tolerance for energy in energies)
    counts = Counter(state_tuples)
    unique_ground = sum(abs(compute_qubo_energy(state, encoding) - ground_energy) <= tolerance for state in counts)
    ordered = sorted(energies)
    median = ordered[len(ordered) // 2] if len(ordered) % 2 else (ordered[len(ordered) // 2 - 1] + ordered[len(ordered) // 2]) / 2
    absolute, relative = energy_gap(min(energies), ground_energy)
    return SampleSummary(len(states), hits, hits / len(states), wilson_interval(hits, len(states)), len(counts),
                         unique_ground, min(energies), sum(energies) / len(energies), median, absolute, relative)


def rank_unique_states(states: Sequence[Sequence[int]], encoding: MissionEncoding, ground_energy: float, limit: int = 10) -> list[dict]:
    counts = Counter(tuple(int(bit) for bit in state) for state in states)
    rows = []
    for state, count in counts.items():
        energy = compute_qubo_energy(state, encoding)
        violations = assignment_violations(state, encoding)
        rows.append({"state": state, "energy": energy, "gap_from_ground": energy - ground_energy, "count": count,
                     "ground_state": abs(energy - ground_energy) <= 1e-8, "assignment_valid": not violations,
                     "violations": violations})
    return sorted(rows, key=lambda row: (row["energy"], -row["count"], row["state"]))[:limit]


def samples_required_for_confidence(single_sample_probability: float, confidence: float = 0.99) -> float:
    if not 0 < confidence < 1:
        raise ValueError("confidence must lie strictly between zero and one")
    if single_sample_probability <= 0:
        return math.inf
    if single_sample_probability >= 1:
        return 1.0
    return math.log(1.0 - confidence) / math.log(1.0 - single_sample_probability)


def time_to_solution(single_sample_probability: float, sample_time_seconds: float, confidence: float = 0.99) -> float:
    if sample_time_seconds < 0:
        raise ValueError("sample time cannot be negative")
    return samples_required_for_confidence(single_sample_probability, confidence) * sample_time_seconds
