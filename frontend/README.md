# University LMS — Frontend (`frontend/`)

Single-page web client for University LMS built with **React 19**, **TypeScript**, **Tailwind CSS v4**, **Vite**, **React Router 7**, `lucide-react`, and `dompurify`.

## Scripts

Run from `frontend/`:

- `npm ci` — clean install locked dependencies.
- `npm run dev` — start Vite development server (default `http://localhost:5173`).
- `npm run build` — run TypeScript typecheck (`tsc -p tsconfig.app.json --noEmit`) and bundle production assets into `frontend/dist/`.
- `npm run lint` — lint TypeScript/React sources with `oxlint`.
- `npm run preview` — preview the production build locally.

## Environment variables (`vite.config.ts`)

- `LMS_FRONTEND_PORT` — Vite dev server port (defaults to `5173`).
- `LMS_API_PROXY_TARGET` — backend origin proxied for `/api` (including WebSockets) and `/uploads` during `npm run dev` (defaults to `http://127.0.0.1:8000`; set to `http://127.0.0.1:8001` when running against `scripts/serve_e2e_test_database.py`).

In unified local production/demo mode (`START_SYSTEM.bat`), FastAPI serves `frontend/dist/` directly on `http://127.0.0.1:8000`.
