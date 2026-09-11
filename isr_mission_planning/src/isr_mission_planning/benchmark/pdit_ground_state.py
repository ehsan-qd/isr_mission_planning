"""Exact categorical-optimum reference and p-bit/p-dit cross-representation energy comparison.

Lives in ``benchmark/`` (not ``solvers/orbit/``) for the same reason ``solve_qubo_exact`` does:
it needs ``benchmark``-side helpers (``GroundStateResult``, the independent QUBO energy auditor),
and ``benchmark`` already depends on ``solvers.orbit`` one-way (see ``benchmark/runner.py``'s
solver registry) — importing this direction from inside ``solvers/orbit`` would create a circular
import.
"""

from __future__ import annotations

import time
from typing import Any

import numpy as np
from scipy.optimize import Bounds, LinearConstraint, milp
from scipy.sparse import lil_matrix

from ..solvers.orbit.pdit_encoding import (
    CategoricalAssignmentModel,
    _variable_name,
    assignment_to_one_hot,
    compute_pdit_energy,
    one_hot_to_assignment,
)
from .energy import compute_qubo_energy
from .ground_state import GroundStateResult


def energy_equivalence_check(assignment: dict[str, str], model: CategoricalAssignmentModel,
                             v2_encoding, assignment_penalty: float, tolerance: float = 1e-8) -> dict[str, float | bool]:
    """Compare independent p-dit energy against the V2 p-bit energy minus its (constant) assignment penalty.

    For any valid one-hot assignment the exactly-one penalty component contributes exactly
    ``-assignment_penalty`` per task (see ``encoding_v2.py``'s constant-shifted penalty comment),
    so subtracting that constant aligns the two representations' shared operational objective.
    """
    pdit_energy = compute_pdit_energy(assignment, model)
    one_hot = assignment_to_one_hot(assignment, model)
    state = tuple(one_hot[name] for name in v2_encoding.variable_order)
    pbit_energy = compute_qubo_energy(state, v2_encoding)
    pbit_operational_energy = pbit_energy - (-assignment_penalty * len(assignment))
    difference = pdit_energy - pbit_operational_energy
    return {"pdit_energy": pdit_energy, "pbit_energy": pbit_energy,
            "pbit_operational_energy": pbit_operational_energy, "difference": difference,
            "agrees": abs(difference) <= tolerance}


def solve_categorical_exact(model: CategoricalAssignmentModel, *, time_limit_seconds: float | None = None) -> GroundStateResult:
    """Exact categorical optimum via MILP: same McCormick linearisation as ``solve_qubo_exact``,
    but with an explicit exactly-one equality constraint per task instead of a penalty term.

    Uses one-hot binary indicators internally (over ``model.variable_order``) purely as the
    exact-reference solver's internal representation; this does not make the sampler-facing
    p-dit model binary.
    """
    order = model.variable_order
    index = {name: position for position, name in enumerate(order)}
    n = len(order)
    pairs = [(index[a], index[b], coefficient) for (a, b), coefficient in model.pairwise.items() if coefficient != 0]
    total_variables = n + len(pairs)

    objective = np.zeros(total_variables)
    for name, coefficient in model.unary.items():
        objective[index[name]] = coefficient
    for position, (_, _, coefficient) in enumerate(pairs, start=n):
        objective[position] = coefficient

    rows = 3 * len(pairs) + len(model.task_states)
    constraints = lil_matrix((rows, total_variables), dtype=float)
    upper = np.zeros(rows)
    lower = np.full(rows, -np.inf)
    for pair_position, (i, j, _) in enumerate(pairs):
        z = n + pair_position
        row = 3 * pair_position
        constraints[row, z], constraints[row, i] = 1.0, -1.0
        constraints[row + 1, z], constraints[row + 1, j] = 1.0, -1.0
        constraints[row + 2, i], constraints[row + 2, j], constraints[row + 2, z] = 1.0, 1.0, -1.0
        upper[row + 2] = 1.0

    equality_row = 3 * len(pairs)
    for task, uavs in model.task_states.items():
        for uav in uavs:
            constraints[equality_row, index[_variable_name(uav, task)]] = 1.0
        lower[equality_row] = upper[equality_row] = 1.0
        equality_row += 1

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
    audited = None
    if state is not None:
        assignment = one_hot_to_assignment(dict(zip(order, state, strict=True)), model)
        audited = compute_pdit_energy(assignment, model)
    reported = float(result.fun) if result.fun is not None else None
    if audited is not None and reported is not None and abs(audited - reported) > 1e-7:
        raise RuntimeError(f"MILP objective {reported} disagrees with independent categorical energy {audited}")
    proven = result.status == 0 and bool(result.success)
    status = "OPTIMAL" if proven else ("TIME_LIMIT" if result.status == 1 else "ERROR")
    lower_bound = float(result.mip_dual_bound) if getattr(result, "mip_dual_bound", None) is not None else None
    mip_gap = float(result.mip_gap) if getattr(result, "mip_gap", None) is not None else None
    return GroundStateResult(
        status, proven, state, audited, runtime, lower_bound, mip_gap,
        {"solver": "scipy.optimize.milp/HiGHS", "message": str(result.message), "categorical_variables": n,
         "linearised_product_variables": len(pairs), "milp_variables": total_variables,
         "exactly_one_constraints": len(model.task_states)},
    )
