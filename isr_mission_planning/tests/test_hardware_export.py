import itertools
import json

import numpy as np
import pytest
from scipy.io import mmread

from isr_mission_planning.benchmark.hardware_export import export_all, sparse_v2_qubo
from isr_mission_planning.generation import generate_scenario
from isr_mission_planning.solvers.orbit.encoding_v2 import GeographicAssignmentV2Encoding
from isr_mission_planning.solvers.orbit.hybrid import OrbitHybridSolver


@pytest.mark.parametrize('scale,seed', list(itertools.product(('small', 'medium'), (42, 101, 2026))))
def test_sparse_matches_benchmark_encoder(scale, seed):
    scenario = generate_scenario(scale, seed)
    config = OrbitHybridSolver().v2_config
    expected = GeographicAssignmentV2Encoding(config).encode(scenario)
    upper = np.asarray(expected.qubo_matrix)
    actual, variables = sparse_v2_qubo(scenario, config)
    assert tuple(f'assign::{u.id}::{t.id}' for t, u in variables) == expected.variable_order
    np.testing.assert_allclose(actual.toarray(), (upper + upper.T) / 2, rtol=1e-14, atol=1e-14)
    rng = np.random.default_rng(seed)
    for state in [np.zeros(len(variables)), np.ones(len(variables)), *rng.integers(0, 2, size=(20, len(variables)))]:
        assert float(state @ actual @ state) == pytest.approx(float(state @ upper @ state), abs=1e-8)


def test_export_roundtrip_and_mapping(tmp_path):
    source = tmp_path / 'source'
    source.mkdir()
    generate_scenario('small', 42).to_json(source / 'small_seed_42.json')
    output = tmp_path / 'export'
    record, = export_all(source, output)
    path = output / record['matrix_file']
    assert path.read_text().splitlines()[0] == '%%MatrixMarket matrix coordinate real general'
    matrix = mmread(path, spmatrix=True).tocsr()
    assert matrix.nnz == record['nonzeros']
    metadata = json.loads((output / record['metadata_file']).read_text())
    assert len(metadata['variable_mapping']) == matrix.shape[0]
    assert metadata['variable_mapping'][0]['matrix_index'] == 1
    assert metadata['variable_mapping'][0]['state_index'] == 0
    assert (output / metadata['scenario_file']).read_bytes() == (source / 'small_seed_42.json').read_bytes()
