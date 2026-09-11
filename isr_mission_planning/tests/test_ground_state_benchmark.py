import importlib.util
import json

import numpy as np
import pytest

from isr_mission_planning.benchmark.energy import audit_energy, compute_qubo_energy
from isr_mission_planning.benchmark.ground_state import exhaustive_ground_state, solve_qubo_exact
from isr_mission_planning.benchmark.orbit_sampling import run_orbit_sampling
from isr_mission_planning.benchmark.sample_analysis import energy_gap, samples_required_for_confidence, summarise_samples
from isr_mission_planning.generation import generate_scenario
from isr_mission_planning.solvers import SolverConfig
from isr_mission_planning.solvers.orbit.encoding import AssignmentSequencingEncoding


def test_known_qubo_energy_uses_upper_triangular_convention():
    qubo = np.array([[1.0, -3.0], [0.0, 2.0]])
    assert compute_qubo_energy((1, 1), qubo) == 0.0
    assert compute_qubo_energy((1, 0), qubo) == 1.0
    with pytest.raises(ValueError):
        compute_qubo_energy((0, 2), qubo)


@pytest.mark.parametrize("seed", [2, 7, 19])
def test_exhaustive_matches_milp(seed):
    rng = np.random.default_rng(seed)
    matrix = np.triu(rng.integers(-4, 5, size=(6, 6)).astype(float))
    exhaustive = exhaustive_ground_state(matrix)
    exact = solve_qubo_exact(matrix)
    assert exact.optimality_proven
    assert exact.ground_state_energy == pytest.approx(exhaustive.ground_state_energy)
    assert len(exact.ground_state) == 6
    assert set(exact.ground_state) <= {0, 1}
    assert compute_qubo_energy(exact.ground_state, matrix) == pytest.approx(exact.ground_state_energy)


def test_sample_statistics_and_gap_edges():
    encoding = AssignmentSequencingEncoding().encode(generate_scenario("small", 42))
    zero = (0,) * len(encoding.variable_order)
    one = (1,) * len(encoding.variable_order)
    ground = min(compute_qubo_energy(zero, encoding), compute_qubo_energy(one, encoding))
    summary = summarise_samples((zero, zero, one), encoding, ground)
    assert summary.number_of_samples == 3
    assert summary.ground_state_samples >= 1
    assert energy_gap(1.0, 0.0) == (1.0, None)
    assert samples_required_for_confidence(1.0, 0.99) == 1.0


def test_sampling_result_serialises_to_json(tmp_path):
    from isr_mission_planning.benchmark.orbit_sampling import OrbitSamplingRun

    run = OrbitSamplingRun(0, 2, 2, ((0, 1), (1, 0)), (1.0, -1.0), (1, 0), -1.0, 0.1,
                           metadata={"downstream_makespan": 3.5})
    path = tmp_path / "run.json"
    run.to_json(path)
    restored = json.loads(path.read_text())
    assert restored["actual_samples"] == 2
    assert restored["states"] == [[0, 1], [1, 0]]


@pytest.mark.skipif(importlib.util.find_spec("orbit_sdk") is None or importlib.util.find_spec("orbit_simulator") is None,
                    reason="optional local ORBIT packages are not installed")
def test_orbit_sdk_minimum_energy_is_independently_audited():
    encoding = AssignmentSequencingEncoding().encode(generate_scenario("small", 42))
    run = run_orbit_sampling(encoding, 20, config=SolverConfig(orbit_replicas=1, orbit_processes=1))
    checked = audit_energy(run.metadata["sdk_minimum_energy"], run.best_state, encoding)
    assert checked["agrees"]
    assert run.actual_samples == 20
