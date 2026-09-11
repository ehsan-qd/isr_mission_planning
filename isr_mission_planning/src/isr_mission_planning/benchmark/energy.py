"""Independent QUBO mathematics; this module never calls the ORBIT SDK."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Sequence

import numpy as np

from ..models.common import JsonModel
from ..solvers.orbit.encoding import MissionEncoding


@dataclass(frozen=True)
class QuboDiagnostics(JsonModel):
    convention: str
    number_of_variables: int
    nonzero_linear_coefficients: int
    nonzero_quadratic_coefficients: int
    possible_pair_interactions: int
    actual_pair_interactions: int
    density: float
    minimum_coefficient: float | None
    maximum_coefficient: float | None
    minimum_absolute_coefficient: float | None
    maximum_absolute_coefficient: float | None
    constant_offset: float


def validate_binary_state(state: Sequence[int] | np.ndarray, number_of_variables: int) -> np.ndarray:
    vector = np.asarray(state, dtype=float)
    if vector.ndim != 1 or vector.size != number_of_variables:
        raise ValueError(f"Expected a one-dimensional state of length {number_of_variables}")
    if not np.all(np.isin(vector, (0.0, 1.0))):
        raise ValueError("QUBO state must contain binary values only")
    return vector


def as_qubo_matrix(qubo: MissionEncoding | Sequence[Sequence[float]] | np.ndarray) -> np.ndarray:
    matrix = np.asarray(qubo.qubo_matrix if isinstance(qubo, MissionEncoding) else qubo, dtype=float)
    if matrix.ndim != 2 or matrix.shape[0] != matrix.shape[1]:
        raise ValueError("QUBO matrix must be square")
    if not np.all(np.isfinite(matrix)):
        raise ValueError("QUBO coefficients must be finite")
    return matrix


def compute_qubo_energy(
    state: Sequence[int] | np.ndarray,
    qubo: MissionEncoding | Sequence[Sequence[float]] | np.ndarray,
    *,
    constant_offset: float = 0.0,
) -> float:
    """Compute ``E(x) = x.T @ Q @ x + offset``.

    The project's Q is upper triangular. Each off-diagonal coefficient therefore
    appears once and must not be doubled by the auditor.
    """
    matrix = as_qubo_matrix(qubo)
    vector = validate_binary_state(state, matrix.shape[0])
    return float(vector @ matrix @ vector + constant_offset)


def qubo_diagnostics(qubo: MissionEncoding | Sequence[Sequence[float]] | np.ndarray) -> QuboDiagnostics:
    matrix = as_qubo_matrix(qubo)
    n = matrix.shape[0]
    diagonal = np.diag(matrix)
    upper = np.triu(matrix, 1)
    linear_count = int(np.count_nonzero(diagonal))
    quadratic_count = int(np.count_nonzero(upper))
    possible = n * (n - 1) // 2
    nonzero = np.concatenate((diagonal[diagonal != 0], upper[upper != 0]))
    offset = float(qubo.metadata.get("constant_offset", 0.0)) if isinstance(qubo, MissionEncoding) else 0.0
    return QuboDiagnostics(
        convention="E(x) = x^T Q x + offset; Q is upper triangular and off-diagonal terms are counted once",
        number_of_variables=n,
        nonzero_linear_coefficients=linear_count,
        nonzero_quadratic_coefficients=quadratic_count,
        possible_pair_interactions=possible,
        actual_pair_interactions=quadratic_count,
        density=0.0 if possible == 0 else quadratic_count / possible,
        minimum_coefficient=float(nonzero.min()) if nonzero.size else None,
        maximum_coefficient=float(nonzero.max()) if nonzero.size else None,
        minimum_absolute_coefficient=float(np.abs(nonzero).min()) if nonzero.size else None,
        maximum_absolute_coefficient=float(np.abs(nonzero).max()) if nonzero.size else None,
        constant_offset=offset,
    )


def audit_energy(reported_energy: float, state: Sequence[int], encoding: MissionEncoding, tolerance: float = 1e-8) -> dict[str, float | bool]:
    independent = compute_qubo_energy(state, encoding, constant_offset=float(encoding.metadata.get("constant_offset", 0.0)))
    difference = independent - float(reported_energy)
    return {"reported_energy": float(reported_energy), "independent_energy": independent,
            "difference": difference, "agrees": abs(difference) <= tolerance}
