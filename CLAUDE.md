# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository layout

Two independent projects, each deployed separately — there is no root build/test/lint command:

```
infra/       AWS CDK (Python) — Cognito, DynamoDB, S3, Lambda, API Gateway
frontend/    React/Vite dashboard (Vercel)
```

`frontend/` talks to `infra/`'s API over HTTPS only; there is no shared code or types between them. See `frontend/CLAUDE.md` for frontend-specific commands and architecture — this file focuses on `infra/` and how the two sides fit together.

## Commands (`infra/`)

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt

npx aws-cdk synth                        # generate CFN templates locally, safe, no AWS creds needed
pytest                                    # tests/unit exists but currently has no tests written
npx aws-cdk deploy --all --profile pf-corrosion   # requires explicit user go-ahead — see below
```

Deploying is a real AWS action against account `234329974788` (profile `pf-corrosion`, region `us-east-1`) — always confirm with the user before running `cdk deploy` or `cdk bootstrap`, even though `cdk synth` is safe to run freely.

Before any real deploy, the inference Lambda's native dependency layer must be populated (it's gitignored, ~130MB, not committed):

```bash
cd pf_corrosion_infra/lambda_src/inference/layer
pip install -r requirements.txt -t python \
  --platform manylinux2014_x86_64 --implementation cp \
  --python-version 3.11 --only-binary=:all:
```

## Architecture (`infra/`)

Serverless: API Gateway (Cognito authorizer) → Lambda (Python) → DynamoDB + S3. Four CDK stacks in `pf_corrosion_infra/stacks/`, deployed in dependency order `Storage`+`Auth` → `Compute` → `Api` (wired in `app.py`):

- **`CorriaAuthStack`** — Cognito User Pool + 4 groups: `super_admin`, `admin`, `tecnico`, `cliente`.
- **`CorriaStorageStack`** — DynamoDB tables: `usuarios`, `empresas`, `bloques`, and a fused `puntos-mediciones` table (partition key `id_punto`, sort key `sk`: `METADATA` for the point record, `MED#{timestamp}` per measurement).
- **`CorriaComputeStack`** — 5 Lambdas, one per API resource: `api-usuarios`, `api-puntos`, `api-mediciones`, `api-alertas`, `inference`.
- **`CorriaApiStack`** — REST routes, all Cognito-authorized.

Each Lambda's handler lives at `pf_corrosion_infra/lambda_src/<name>/handler.py`. **There is no shared module between Lambdas** — helpers like `_claims()` (extract Cognito JWT claims) and `_usuario_actual()` (resolve the caller's full user record: role, `empresa_id`) are deliberately duplicated in each handler that needs them (see the module docstring in `api_puntos/handler.py` and `api_usuarios/handler.py`). When fixing a bug in one of these helpers, check whether the same bug exists in the other handlers' copies.

### Multi-tenant RBAC

Every user belongs to one `empresa` (except `super_admin`, which has none and sees everything). `empresa_id` for a new resource is always resolved server-side from the authenticated caller's own user record, never trusted from the request body — except when the caller is `super_admin`, who must supply `empresa_id` explicitly (validated against the `empresas` table). List endpoints filter by the caller's `empresa_id` unless the caller is `super_admin`.

### Punto → Bloque fusion, and the frontend's "Zona" naming

The original data model had a `punto` entity carrying coordinates/measurements. This was fused into `bloque`: a `bloque` is a folder-like grouping inside an `empresa` (one level of hierarchy: empresa → bloque → medición, no nesting) that now owns the coordinates and measurement history that `punto` used to own. `POST /medicion` (in `inference/handler.py`) creates measurements against an existing `bloque` directly — it no longer creates or references any `punto`. The `/puntos/*` routes still exist in `api_puntos/handler.py` but have no consumer left in the frontend.

**The frontend UI calls a `bloque` a "Zona"** (`ZonasPage.jsx`, `ZonasList.jsx`, `ZonaMapPicker.jsx`) — when tracing a feature between frontend and backend, `bloque` and `Zona` are the same entity.

`tipo_material` is a property of the `empresa`, not of individual bloques (set via `POST`/`PUT /empresas` in `api_usuarios/handler.py`).

## Working across the frontend/backend boundary

Frontend hooks in `frontend/src/hooks/` (one per resource) call the API via `frontend/src/lib/apiClient.js`. When a feature spans both sides, the backend's route/response shape is defined in the relevant `lambda_src/*/handler.py` docstring — read that first, since the two repos have no shared types to keep them in sync automatically.
