# Frontend — pf-corrosion

React 18 + Vite 5 + AWS Amplify 6 dashboard for the corrosion detection system. Ported from an earlier prototype and adapted to talk to this repo's own AWS backend (`../infra`) — a separate, independent deployment, not connected to the system it was originally built against.

## Local development

```bash
npm install
cp .env.example .env.local   # fill in the values below
npm run dev
```

## Environment variables

| Variable | Value for this project's backend |
|---|---|
| `VITE_API_URL` | `https://yzesth1il5.execute-api.us-east-1.amazonaws.com/prod/` |
| `VITE_COGNITO_USER_POOL_ID` | `us-east-1_nirWPCLK5` |
| `VITE_COGNITO_CLIENT_ID` | `5vp9op8mlq07qbahpna4fjeld0` |
| `VITE_AWS_REGION` | `us-east-1` |

## Deploying (Vercel)

This is deployed as its **own, new** Vercel project, separate from any prior deployment:

1. Vercel dashboard → Add New → Project → import `Noriega1974/computer-vision-corrosion-steel`.
2. **Root Directory**: `frontend` (this subfolder — Vercel supports deploying a subdirectory of a monorepo as an independent project).
3. Framework preset: Vite (auto-detected).
4. Add the 4 environment variables from the table above under Project Settings → Environment Variables.
5. Deploy.

## First login

An admin account already exists in Cognito for testing: see the project's Engram notes (`corria/aws-migration-barney`) or ask — credentials aren't stored in this repo.
