"""Versioned model artifacts and P04 registry-row writes.

Artifacts are joblib files written only inside ``MODEL_REGISTRY_PATH`` and are
loaded only after the SHA-256 in the sibling manifest matches.  No unpickling
from arbitrary paths is ever attempted.
"""

from __future__ import annotations

import hashlib
import json
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping, Sequence

from ..deps.db import asyncpg_dsn

MANIFEST_FILE = 'manifest.json'
MODEL_FILE = 'model.joblib'


@dataclass(frozen=True)
class ArtifactReceipt:
    """The auditable outcome of saving one model artifact."""

    path: str
    checksum: str
    manifest: dict[str, Any]


def _safe_directory(root: str | Path, name: str, version: str) -> Path:
    base = Path(root).resolve()
    target = (base / name / version).resolve()
    if target != base and base not in target.parents:
        raise ValueError('artifact path escapes MODEL_REGISTRY_PATH')
    return target


def _naive_utc(value: Any) -> Any:
    """Prisma stores timestamps as ``timestamp(3) without time zone``."""
    if isinstance(value, datetime) and value.tzinfo is not None:
        return value.astimezone(timezone.utc).replace(tzinfo=None)
    return value


def _write_json(path: Path, payload: Mapping[str, Any]) -> None:
    temporary = path.with_suffix(path.suffix + '.tmp')
    temporary.write_text(
        json.dumps(payload, indent=2, sort_keys=True) + '\n', encoding='utf-8'
    )
    os.replace(temporary, path)


def save_artifact(
    root: str | Path,
    *,
    name: str,
    version: str,
    estimator: Any,
    feature_names: Sequence[str],
    seed: int,
    feature_version: str,
    dataset_version: str,
    hyperparams: Mapping[str, Any],
    metrics: Mapping[str, Any],
    calibration: Mapping[str, Any],
    calibrator: Any,
) -> ArtifactReceipt:
    """Persist a checksummed joblib artifact plus a JSON manifest."""
    import joblib

    directory = _safe_directory(root, name, version)
    directory.mkdir(parents=True, exist_ok=True)
    model_path = directory / MODEL_FILE
    temporary = model_path.with_suffix('.joblib.tmp')
    joblib.dump(
        {
            'estimator': estimator,
            'featureNames': list(feature_names),
            'calibrator': calibrator,
            'seed': seed,
        },
        temporary,
    )
    os.replace(temporary, model_path)
    checksum = hashlib.sha256(model_path.read_bytes()).hexdigest()
    manifest = {
        'name': name,
        'version': version,
        'featureVersion': feature_version,
        'datasetVersion': dataset_version,
        'featureNames': list(feature_names),
        'seed': seed,
        'hyperparams': dict(hyperparams),
        'metrics': dict(metrics),
        'calibration': dict(calibration),
        'artifact': MODEL_FILE,
        'sha256': checksum,
    }
    _write_json(directory / MANIFEST_FILE, manifest)
    return ArtifactReceipt(path=str(directory), checksum=checksum, manifest=manifest)


def load_artifact(root: str | Path, name: str, version: str) -> tuple[dict[str, Any], dict[str, Any]]:
    """Load an artifact only from inside the registry and only if it matches."""
    import joblib

    directory = _safe_directory(root, name, version)
    manifest_path = directory / MANIFEST_FILE
    if not manifest_path.is_file():
        raise FileNotFoundError(f'no model manifest at {manifest_path}')
    manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    model_path = (directory / str(manifest['artifact'])).resolve()
    if directory not in model_path.parents:
        raise ValueError('manifest artifact path escapes its version directory')
    checksum = hashlib.sha256(model_path.read_bytes()).hexdigest()
    if checksum != manifest['sha256']:
        raise ValueError('model artifact checksum mismatch')
    payload = joblib.load(model_path)
    if list(payload['featureNames']) != list(manifest['featureNames']):
        raise ValueError('model feature names do not match the manifest')
    return payload, manifest


async def write_registry_rows(
    database_url: str,
    *,
    versions: Sequence[Mapping[str, Any]],
    runs: Sequence[Mapping[str, Any]],
) -> list[str]:
    """Upsert ModelVersion rows and replace their ModelRun rows idempotently.

    Each run carries ``modelKey = '<name>:<version>'``; the real cuid is
    resolved inside the same transaction so reruns cannot create orphan rows.
    """
    import asyncpg

    connection = await asyncpg.connect(asyncpg_dsn(database_url))
    version_ids: list[str] = []
    try:
        async with connection.transaction():
            identifiers: dict[str, str] = {}
            for version in versions:
                # Prisma generates cuids client-side; the DB column has no
                # default, so supply a stable deterministic identifier here.
                version_id = hashlib.sha256(
                    f"{version['name']}:{version['version']}".encode('utf-8')
                ).hexdigest()[:24]
                identifier = await connection.fetchval(
                    '''
                    INSERT INTO "ModelVersion"
                      ("id", "name", "version", "featureVersion", "trainingDatasetVersion",
                       "hyperparams", "metrics", "status", "updatedAt")
                    VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::"ModelStatus", NOW())
                    ON CONFLICT ("name", "version") DO UPDATE SET
                      "featureVersion" = EXCLUDED."featureVersion",
                      "trainingDatasetVersion" = EXCLUDED."trainingDatasetVersion",
                      "hyperparams" = EXCLUDED."hyperparams",
                      "metrics" = EXCLUDED."metrics",
                      "status" = EXCLUDED."status",
                      "updatedAt" = NOW()
                    RETURNING "id"
                    ''',
                    version_id,
                    version['name'],
                    version['version'],
                    version['featureVersion'],
                    version['trainingDatasetVersion'],
                    json.dumps(version['hyperparams']),
                    json.dumps(version['metrics']),
                    version['status'],
                )
                identifiers[f"{version['name']}:{version['version']}"] = str(identifier)
                version_ids.append(str(identifier))
            if version_ids:
                await connection.execute(
                    'DELETE FROM "ModelRun" WHERE "modelVersionId" = ANY($1::text[])',
                    version_ids,
                )
            for position, run in enumerate(runs):
                key = str(run['modelKey'])
                if key not in identifiers:
                    raise ValueError(f'run references unknown model {key!r}')
                run_id = hashlib.sha256(
                    f"{identifiers[key]}:{run['seed']}:{position}".encode('utf-8')
                ).hexdigest()[:24]
                await connection.execute(
                    '''
                    INSERT INTO "ModelRun"
                      ("id", "modelVersionId", "startedAt", "finishedAt", "trainRange",
                       "testRange", "seed", "artifactsPath", "metrics", "updatedAt")
                    VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8, $9::jsonb, NOW())
                    ''',
                    run_id,
                    identifiers[key],
                    _naive_utc(run['startedAt']),
                    _naive_utc(run.get('finishedAt')),
                    json.dumps(run['trainRange']),
                    json.dumps(run['testRange']),
                    int(run['seed']),
                    run.get('artifactsPath'),
                    json.dumps(run['metrics']),
                )
    finally:
        await connection.close()
    return version_ids
