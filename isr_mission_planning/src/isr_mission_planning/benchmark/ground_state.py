"""Independent exact classical references for binary quadratic problems."""

from __future__ import annotations

import itertools
import time
from dataclasses import dataclass, field
from typing import Any, Sequence

import numpy as np
from scipy.optimize import Bounds, LinearConstraint, milp
from scipy.sparse import lil_matrix

from ..models.common import JsonModel
from ..solvers.orbit.encoding import MissionEncoding
from .energy import as_qubo_matrix, compute_qubo_energy


@dataclass(frozen=True)
class GroundStateResult(JsonModel):
    status: str
    optimality_proven: bool
    ground_state: tuple[int, ...] | None
    ground_state_energy: float | None
    runtime_seconds: float
    lower_bound: float | None = None
    mip_gap: float | None = None
    solver_metadata: dict[str, Any] = field(default_factory=dict)


def exhaustive_ground_state(qubo: MissionEncoding | Sequence[Sequence[float]], *, maximum_variables: int = 24) -> GroundStateResult:
    matrix = as_qubo_matrix(qubo)
    n = matrix.shape[0]
    if n > maximum_variables:
        raise ValueError(f"Exhaustive enumeration is limited to {maximum_variables} variables, not {n}")
    started = time.perf_counter()
    best_energy, best_state = float("inf"), None
    degeneracy = 0
    for state in itertools.product((0, 1), repeat=n):
        energy = compute_qubo_energy(state, matrix)
        if energy < best_energy - 1e-10:
            best_energy, best_state, degeneracy = energy, state, 1
        elif abs(energy - best_energy) <= 1e-10:
            degeneracy += 1
    return GroundStateResult("OPTIMAL", True, tuple(best_state), best_energy, time.perf_counter() - started,
                             best_energy, 0.0, {"solver": "exhaustive_enumeration", "states_examined": 2 ** n,
                                               "ground_state_degeneracy": degeneracy, "degeneracy_exhaustive": True})


def solve_qubo_exact(
    qubo: MissionEncoding | Sequence[Sequence[float]], *, time_limit_seconds: float | None = None,
) -> GroundStateResult:
    """Solve a QUBO exactly through binary MILP linearisation using SciPy/HiGHS."""
    matrix = as_qubo_matrix(qubo)
    n = matrix.shape[0]
    pairs = [(i, j, float(matrix[i, j])) for i in range(n) for j in range(i + 1, n) if matrix[i, j] != 0]
    total_variables = n + len(pairs)
    objective = np.zeros(total_variables)
    objective[:n] = np.diag(matrix)
    for position, (_, _, coefficient) in enumerate(pairs, start=n):
        objective[position] = coefficient

    # McCormick envelope for binary z_ij = x_i*x_j.
    constraints = lil_matrix((3 * len(pairs), total_variables), dtype=float)
    upper = np.zeros(3 * len(pairs))
    lower = np.full(3 * len(pairs), -np.inf)
    for pair_position, (i, j, _) in enumerate(pairs):
        z = n + pair_position
        row = 3 * pair_position
        constraints[row, z], constraints[row, i] = 1.0, -1.0       # z <= x_i
        constraints[row + 1, z], constraints[row + 1, j] = 1.0, -1.0  # z <= x_j
        constraints[row + 2, i], constraints[row + 2, j], constraints[row + 2, z] = 1.0, 1.0, -1.0
        upper[row + 2] = 1.0                                       # x_i+x_j-z <= 1

    options: dict[str, Any] = {"disp": False}
    if time_limit_seconds is not None:
        options["time_limit"] = float(time_limit_seconds)
    started = time.perf_counter()
    result = milp(
        c=objective, integrality=np.ones(total_variables), bounds=Bounds(0.0, 1.0),
        constraints=LinearConstraint(constraints.tocsr(), lower, upper), options=options,
    )
    runtime = time.perf_counter() - started
    state = tuple(int(round(value)) for value in result.x[:n]) if result.x is not None else None
    audited = compute_qubo_energy(state, matrix) if state is not None else None
    reported = float(result.fun) if result.fun is not None else None
    if audited is not None and reported is not None and abs(audited - reported) > 1e-7:
        raise RuntimeError(f"MILP objective {reported} disagrees with independent QUBO energy {audited}")
    proven = result.status == 0 and bool(result.success)
    status = "OPTIMAL" if proven else ("TIME_LIMIT" if result.status == 1 else "ERROR")
    lower_bound = float(result.mip_dual_bound) if getattr(result, "mip_dual_bound", None) is not None else None
    return GroundStateResult(
        status, proven, state, audited, runtime, lower_bound,
        float(result.mip_gap) if getattr(result, "mip_gap", None) is not None else None,
        {"solver": "scipy.optimize.milp/HiGHS", "message": str(result.message), "qubo_variables": n,
         "linearised_product_variables": len(pairs), "milp_variables": total_variables,
         "mip_node_count": int(result.mip_node_count) if getattr(result, "mip_node_count", None) is not None else None},
    )
