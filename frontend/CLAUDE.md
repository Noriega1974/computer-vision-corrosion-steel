# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # Start Vite dev server (localhost:5173)
npm run build     # Production build → dist/
npm run preview   # Preview production build locally
```

No test runner or linter is configured.

## Architecture

React 18 SPA (Vite) that communicates with an AWS backend (API Gateway + Cognito + S3). No backend code lives here.

### Key layers

- **`src/auth/`** — AWS Amplify v6 Cognito auth. `AuthContext.jsx` holds the session and user groups. `amplifyConfig.js` reads Cognito pool IDs from env vars. A global `auth:unauthorized` event triggers auto-logout on any 401.
- **`src/lib/apiClient.js`** — Thin HTTP client. All requests attach `Authorization: Bearer {idToken}`. Single place to change base URL or auth headers.
- **`src/hooks/`** — One hook per API resource (e.g., `useMediciones`, `usePuntos`). They use `RefreshKeyContext` (`hooks/RefreshKeyContext.jsx`) for cache invalidation instead of React Query/SWR—call `triggerRefresh()` after mutations to refetch.
- **`src/pages/`** — One file per route. Pages compose hooks + components and own their local state.
- **`src/components/`** — Reusable widgets (map, charts, KPI cards, sidebar).
- **`src/layouts/AppLayout.jsx`** — Wraps authenticated pages: collapsible sidebar + top header.

### Routing & auth

`App.jsx` wraps every non-login route in `<ProtectedRoute>`, which redirects to `/login` if no session. Role-based UI visibility is driven by Cognito groups (`admin`, `tecnico`, `cliente`) read from the JWT claims in `AuthContext`.

### Styling

Vanilla CSS with CSS custom properties defined in `src/index.css`. Light/dark theme toggled via `data-theme` on `<html>` (persisted in localStorage). No Tailwind, no CSS Modules, no styled-components.

### Maps & charts

- **Leaflet** (loaded via CDN in `index.html`) + **React-Leaflet** for the Colombia plant map in `ColombiaMap.jsx`.
- **Recharts** for all data visualizations in `ChartsRow.jsx`.

### Photo upload flow

`UploadPage.jsx` uses **exifr** to extract GPS coordinates and timestamp from photo EXIF metadata, pre-populates the form, then POSTs to `/medicion`. Images are stored in S3; the DB record holds the S3 URL.

## Environment variables

Defined in `.env.local` (git-ignored):

```
VITE_API_URL=<API Gateway URL>
VITE_COGNITO_USER_POOL_ID=<pool id>
VITE_COGNITO_CLIENT_ID=<client id>
VITE_AWS_REGION=us-east-1
```

## Deployment

Hosted on Vercel. `vercel.json` rewrites all paths to `index.html` for SPA routing. Build output goes to `dist/`.
