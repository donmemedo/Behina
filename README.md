# Khaneh Behineh (Sealed · Iran)

- `backend/` FastAPI (estimate, leads → SQLite, demo dashboard) · `frontend/` Next.js (fa/en, light/dark, PWA) · `mobile/` Capacitor shell (Android + iOS)

## Run
- Docker: `docker compose up --build` → http://localhost:3023
- Dev: `cd backend && .venv/bin/uvicorn main:app --host 0.0.0.0 --port 8023` and `cd frontend && npm run dev` (proxies /api to :8023)
- Prod (no Docker): `cd frontend && npm run build && npm start`
- Backend check: `cd backend && .venv/bin/python test_main.py`

See [AUDIT_REPORT.md](AUDIT_REPORT.md) for security findings, measured performance costs, and test limitations, and [HANDOFF.md](HANDOFF.md) for the remaining release and publishing steps.

## PWA
Manifest, icons, and a service worker are built in. It caches public static assets and a generic offline fallback; API responses and visited pages, including the dashboard, are never cached. Install works on `localhost` or any **HTTPS** origin; plain `http://<LAN-IP>` won't offer install.

## Mobile (APK / IPA)
The native app loads the live web app from `APP_URL` (default `http://192.168.1.106:3023`, LAN testing). Production sync requires an explicit HTTPS address.

```sh
cd mobile && npm ci
APP_URL=https://your-domain npm run sync:release
# Development only: npx cap sync (uses the default LAN address)
APP_MODE=production APP_URL=https://your-domain npm run apk
# JDK 21 + Android SDK → android/app/build/outputs/apk/debug/app-debug.apk
APP_MODE=production APP_URL=https://your-domain npm run ios  # macOS + Xcode only
```
The `apk` and `ios` scripts sync again, so keep the production environment on those commands too. Running them without it uses LAN development settings.
No local toolchain? Push to GitHub and run `.github/workflows/mobile.yml` (debug APK + unsigned IPA). A signed IPA needs an Apple Developer account.

## Security checks

```sh
cd backend
.venv/bin/python -m unittest test_security -v
.venv/bin/python test_main.py
.venv/bin/python benchmark_security.py
```

```sh
cd frontend
npm test
npm run typecheck
node benchmark-format.mjs
```

The Docker backend runs as UID 10001 and applies concurrency and body-read limits. Existing root-owned `/data` volumes need an ownership migration before using this image. The application quota is per process and sees the Next proxy as its peer; add per-client limiting at a trusted HTTPS ingress. The dashboard contains fixed demo data and has no account authentication.
