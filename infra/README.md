# pf-corrosion-infra

AWS CDK (Python) infrastructure for **pf-corrosion** — steel corrosion
detection via YOLO segmentation. This project replicates and corrects the
existing "CorrIA" backend, moving it from a borrowed AWS account into the
user's own account ("Barney").

**Status: code only, NOT deployed.** `cdk deploy` has not been run against
any AWS account. See "Deploying" below for the explicit go-ahead this
requires.

## Architecture — 4 stacks

```
CorriaAuthStack     Cognito User Pool (email login, groups: admin/tecnico/cliente)
CorriaStorageStack  DynamoDB tables + S3 images bucket
CorriaComputeStack  5 Lambda functions + EventBridge cleanup rule
CorriaApiStack      API Gateway REST API (Cognito authorizer) + routes
```

Dependency order: `Storage` + `Auth` → `Compute` → `Api`.

## What changed vs. the source system, and why

- **`api-reportes` eliminated.** All 4 `/reportes*` routes and the Lambda
  itself are gone — the reports feature was decided out of scope for this
  migration.

- **`puntos` + `mediciones` fused into one DynamoDB table**
  (`pf-corrosion-puntos-mediciones`). Partition key `id_punto`; sort key
  `sk` — `METADATA` for the point record, `MED#{timestamp}` for each
  medición. This removes the need for two round trips (or a second table)
  to answer "give me a point and its history." Three GSIs were migrated
  as-is from the source tables (`ClaveLogicaIndex`, `nivel-timestamp-index`,
  `tipo-timestamp-index`), plus a new `usuario-timestamp-index`
  (`usuario_id` / `timestamp`) for reverse lookup — "what has this user
  created or measured" — populated from `creado_por_id` on point records
  and `tomado_por_id` on medición records.

- **`empresa` field removed.** It was dead weight (single-tenant system,
  always "Corpacero") — dropped from `usuarios`, from `puntos`
  (`clave_logica` is now `f"{sede}-{ciudad}"` instead of
  `f"{empresa}-{sede}-{ciudad}"`), and from denormalized fields on
  medición records.

- **`GET /puntos/buscar` removed** — unused filter-by-empresa/ciudad scan
  endpoint, no longer meaningful once `empresa` is gone.

- **CRITICAL SECURITY FIX — inference Lambda IAM scope.** In the source
  account, `corria-inference`'s execution role had full read/write on
  **all three** tables (`corria-puntos`, `corria-mediciones`,
  `corria-usuarios`) plus a leftover `USER_POOL_ID` env var — verified via
  `aws lambda get-function-configuration` against the source account, and
  the handler code never references `usuarios` or Cognito at all. In this
  project, `pf-corrosion-inference`'s role is scoped to **only** the fused
  puntos+mediciones table and the images S3 bucket. No usuarios table
  access, no `USER_POOL_ID` env var.

- **Identity capture added to inference.** The source inference Lambda had
  zero extraction of the caller's identity from the Cognito JWT. It now
  extracts `sub` via a `_claims()` helper (same pattern as
  `api-usuarios`) and writes it as `creado_por_id` (new points) and
  `tomado_por_id` (mediciones).

## AWS account / profile

- Profile: `pf-corrosion`
- Account ID: `234329974788`
- Region: `us-east-1`

## Deploying

**Not run yet.** Once the user gives explicit go-ahead:

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# One-time per account/region, only needed before the first deploy:
npx aws-cdk bootstrap --profile pf-corrosion aws://234329974788/us-east-1

npx aws-cdk synth   --profile pf-corrosion   # local template generation, safe
npx aws-cdk deploy --all --profile pf-corrosion
```

### Before deploying: the inference Lambda's runtime dependency layer

`pf-corrosion-inference` needs `onnxruntime`, `numpy`, and `Pillow` on the
Lambda runtime. These were shipped via a separate Lambda Layer in the
source system (`corria-inference-deps`, verified: onnxruntime==1.16.3,
numpy==1.26.4, Pillow==10.4.0 — see
`pf_corrosion_infra/lambda_src/inference/layer/requirements.txt`).

This directory is gitignored (~130MB of third-party wheels — don't commit
binaries). Populate it locally before every deploy:

```bash
cd pf_corrosion_infra/lambda_src/inference/layer
pip install -r requirements.txt -t python \
  --platform manylinux2014_x86_64 --implementation cp \
  --python-version 3.11 --only-binary=:all:
```

This produces a `python/` subdirectory (~131MB) that CDK zips into the
layer asset on the next `cdk synth`/`cdk deploy`.

The ONNX model itself (`yolov8n-seg.onnx`, ~13MB) IS already packaged
directly in the Lambda's own asset folder
(`pf_corrosion_infra/lambda_src/inference/model/`) — not in S3, not in the
layer — matching how the source system shipped it.

**Gotcha found and fixed while building the layer**: the inference
function's `Code.from_asset()` originally zipped its whole source
directory, which — once the layer's `python/` subfolder existed on disk —
would have bundled the same ~131MB of wheels a second time into the
function's own code. Function (144MB) + layer (131MB) combined would have
exceeded Lambda's 250MB unzipped deployment-package limit. Fixed with
`exclude=["layer", "__pycache__"]` on that asset in `compute_stack.py`;
function code is now ~13MB (handler + model) as intended. If you ever
restructure this Lambda's source layout, re-verify combined unzipped size
stays under 250MB.

## Project layout

```
app.py                                CDK app entry point, wires all 4 stacks
pf_corrosion_infra/stacks/            one file per stack
pf_corrosion_infra/lambda_src/        one directory per Lambda's handler.py
  api_usuarios/  api_puntos/  api_mediciones/  api_alertas/  inference/
tests/unit/                           (empty — no unit tests written yet)
```
