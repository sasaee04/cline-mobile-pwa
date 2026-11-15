# Cline Mobile PWA Starter

This project is a starter for a desktop-hosted Cline core with a mobile-friendly web/PWA frontend.

## Architecture

- Server: Express + Socket.IO
- Client: React + Vite
- Mobile: PWA installed from browser
- Runtime: Cline backend can later replace the mock endpoint

## Setup

```bash
npm install
npm run dev
```

Then open:

- Web app: http://localhost:5173
- API: http://localhost:3001/health

## Notes

This is a starter architecture, not a direct port of the VS Code extension.
The goal is to keep the real Cline runtime on a computer/server and expose it to mobile via web/PWA.
