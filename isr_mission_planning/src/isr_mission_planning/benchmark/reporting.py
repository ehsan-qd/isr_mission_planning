from __future__ import annotations

import csv
import json
from pathlib import Path

from ..models import BenchmarkResult


def save_benchmark_results(results: list[BenchmarkResult], json_path: str | Path, csv_path: str | Path) -> None:
    json_target, csv_target = Path(json_path), Path(csv_path)
    json_target.parent.mkdir(parents=True, exist_ok=True)
    csv_target.parent.mkdir(parents=True, exist_ok=True)
    json_target.write_text(json.dumps([item.to_dict() for item in results], indent=2, sort_keys=True) + "\n", encoding="utf-8")
    rows = [item.to_dict() for item in results]
    if rows:
        with csv_target.open("w", newline="", encoding="utf-8") as handle:
            writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
            writer.writeheader()
            for row in rows:
                row["timing"] = json.dumps(row["timing"], sort_keys=True)
                writer.writerow(row)
