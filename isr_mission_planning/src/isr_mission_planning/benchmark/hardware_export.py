"""Sparse, energy-preserving Matrix Market export of the benchmark V2 QUBO."""
from __future__ import annotations

import csv
import hashlib
import json
import math
import time
from pathlib import Path

import numpy as np
from scipy import sparse
from scipy.io import mmread

from ..geometry import euclidean_distance, travel_time
from ..models import MissionScenario
from ..solvers.orbit.encoding_v2 import GeographicV2Config
from ..solvers.orbit.hybrid import OrbitHybridSolver


def sparse_v2_qubo(scenario: MissionScenario, config: GeographicV2Config):
    """Build symmetric Q without the dense encoder's quadratic memory overhead.

    Variable order and arithmetic follow GeographicAssignmentV2Encoding; each
    upper-triangular pair coefficient is split across the two stored triangles.
    """
    variables = [(task, uav) for task in scenario.tasks for uav in scenario.uavs
                 if task.required_sensor in uav.sensors]
    by_task = {task.id: [] for task in scenario.tasks}
    by_uav = {uav.id: [] for uav in scenario.uavs}
    diameter = max(math.hypot(scenario.operating_area.width, scenario.operating_area.height), 1e-12)
    time_scale = diameter / min(uav.speed for uav in scenario.uavs)
    max_service = max(task.service_duration for task in scenario.tasks)
    base_cost, burdens = [], []
    for i, (task, uav) in enumerate(variables):
        by_task[task.id].append(i)
        by_uav[uav.id].append(i)
        base_time = travel_time(scenario.base(uav.home_base_id).location, task.location, uav.speed) / time_scale
        base_cost.append(config.base_weight * base_time)
        burdens.append(task.service_duration / max_service + config.travel_burden_factor * base_time)
    if any(not indices for indices in by_task.values()):
        raise ValueError('Every task must have at least one eligible UAV')
    target = sum(min(burdens[i] for i in indices) for indices in by_task.values()) / len(scenario.uavs)
    workload_scale = max(target, 1.0)
    rows, cols, values = [], [], []

    def pair(i, j, value):
        if value:
            rows.extend((i, j)); cols.extend((j, i)); values.extend((value / 2, value / 2))

    for i in range(len(variables)):
        burden = burdens[i] / workload_scale
        rows.append(i); cols.append(i)
        values.append(-config.assignment_penalty + base_cost[i]
                      + config.workload_weight * (burden * burden - 2.0 * burden))
    for indices in by_task.values():
        for pos, i in enumerate(indices):
            for j in indices[pos + 1:]:
                pair(i, j, 2.0 * config.assignment_penalty)
    for indices in by_uav.values():
        for pos, i in enumerate(indices):
            task, uav = variables[i]
            for j in indices[pos + 1:]:
                pair_time = euclidean_distance(task.location, variables[j][0].location) / uav.speed / time_scale
                geographic = config.cluster_weight * min(pair_time, config.cluster_distance_cap)
                workload = config.workload_weight * 2.0 * (burdens[i] / workload_scale) * (burdens[j] / workload_scale)
                pair(i, j, geographic + workload)
    matrix = sparse.coo_matrix((values, (rows, cols)), shape=(len(variables), len(variables))).tocsr()
    matrix.eliminate_zeros()
    matrix.sort_indices()
    return matrix, variables


def _sha256(path):
    digest = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


def export_all(scenario_root='data/scenarios', output_root='data/q_matrices'):
    paths = sorted(Path(scenario_root).rglob('*.json'))
    if not paths:
        raise ValueError(f'No scenarios found under {scenario_root}')
    output = Path(output_root)
    output.mkdir(parents=True, exist_ok=True)
    (output / 'mtx').mkdir(exist_ok=True)
    config = OrbitHybridSolver().v2_config
    records = []
    seen = set()
    for source in paths:
        scenario = MissionScenario.read_json(source)
        job_id = f'{scenario.scenario_id}_{config.formulation_name}_qubo'
        if job_id in seen or Path(job_id).name != job_id:
            raise ValueError(f'Duplicate or unsafe job ID: {job_id}')
        seen.add(job_id)
        started = time.perf_counter()
        matrix, variables = sparse_v2_qubo(scenario, config)
        encoding_seconds = time.perf_counter() - started
        matrix_path = output / 'mtx' / f'{job_id}.mtx'
        with matrix_path.open('w', encoding='ascii') as stream:
            stream.write('%%MatrixMarket matrix coordinate real general\n%\n')
            stream.write(f'{matrix.shape[0]} {matrix.shape[1]} {matrix.nnz}\n')
            for row in range(matrix.shape[0]):
                for k in range(matrix.indptr[row], matrix.indptr[row + 1]):
                    stream.write(f'{row + 1} {matrix.indices[k] + 1} {matrix.data[k]:.17g}\n')
        restored = mmread(matrix_path, spmatrix=True).tocsr()
        difference = restored - matrix
        if difference.nnz or (restored - restored.T).nnz or not np.isfinite(restored.data).all():
            raise RuntimeError(f'Matrix round-trip verification failed: {matrix_path}')
        snapshot_dir = output / 'scenarios'
        snapshot_dir.mkdir(exist_ok=True)
        snapshot = snapshot_dir / source.name
        snapshot.write_bytes(source.read_bytes())
        record = dict(job_id=job_id, scenario_id=scenario.scenario_id,
                      scale=scenario.metadata.get('scale'), seed=scenario.metadata.get('seed'),
                      tasks=len(scenario.tasks), uavs=len(scenario.uavs), variables=matrix.shape[0],
                      nonzeros=matrix.nnz, matrix_file=matrix_path.relative_to(output).as_posix(),
                      metadata_file=f'{job_id}.json', matrix_sha256=_sha256(matrix_path),
                      scenario_sha256=_sha256(snapshot), encoding_seconds=encoding_seconds)
        metadata = dict(record, schema_version=1, formulation=config.to_dict(),
                        scenario_file=f'scenarios/{snapshot.name}',
                        matrix_format='MatrixMarket matrix coordinate real general',
                        matrix_storage='full symmetric; off-diagonal upper-Q coefficients divided by two',
                        energy_convention='minimize E(x) = x^T Q x, x in {0,1}^n',
                        constant_offset=0.0, coefficient_scale=1.0,
                        variable_order=[f'assign::{uav.id}::{task.id}' for task, uav in variables],
                        variable_mapping=[dict(matrix_index=i + 1, state_index=i,
                                               task_id=task.id, uav_id=uav.id)
                                          for i, (task, uav) in enumerate(variables)])
        (output / record['metadata_file']).write_text(json.dumps(metadata, indent=2) + '\n')
        records.append(record)
        print(f'{job_id}: {matrix.shape[0]} variables, {matrix.nnz} entries', flush=True)
    (output / 'manifest.json').write_text(json.dumps(records, indent=2) + '\n')
    with (output / 'manifest.csv').open('w', newline='') as stream:
        writer = csv.DictWriter(stream, fieldnames=list(records[0]))
        writer.writeheader(); writer.writerows(records)
    return records
