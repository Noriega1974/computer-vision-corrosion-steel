# Computer Vision System for Corrosion Detection and Quantification on Galvanized Steel

Undergraduate thesis project (pf-corrosion). A YOLOv8-based segmentation system that detects and quantifies corrosion on galvanized steel structures from photographs, backed by a serverless AWS architecture and a web dashboard for monitoring measurement points, alerts, and history.

## Repository layout

```
.
├── infra/       AWS CDK (Python) — Cognito, DynamoDB, S3, Lambda, API Gateway
└── frontend/    Web dashboard (Vercel) — not created yet, see frontend/README.md
```

## Status

- **infra/**: CDK app complete, `cdk synth` passes locally. **Not deployed to AWS yet** — see `infra/README.md` for the exact deploy steps and the one known pending item (inference Lambda's native dependency layer must be built for `manylinux2014_x86_64` before a real deploy).
- **frontend/**: not started. Will be built once the backend is deployed and its real API endpoints exist.

## Architecture summary

Fully serverless: API Gateway (Cognito-authorized REST API) → Lambda (Python) → DynamoDB + S3. No EC2, no RDS, no VPC — see `infra/README.md` for the reasoning and the full list of what changed versus the system this project's infrastructure was modeled on (removed an unused reporting module, merged two related tables, tightened one Lambda's IAM permissions to only what its code actually uses).

## Stack

- **Model**: YOLOv8n-seg (ONNX Runtime) for corrosion segmentation
- **Backend**: AWS Lambda (Python), API Gateway, DynamoDB, S3, Cognito — defined as code with AWS CDK
- **Frontend**: React/Vite, deployed on Vercel (pending)
