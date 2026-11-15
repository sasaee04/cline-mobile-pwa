# Cline Mobile PWA

A mobile-friendly remote interface for Cline. The Cline SDK and coding tools run on your computer; your phone is a client. This is not a port of the VS Code extension to Android.

## Run locally

Requirements: Node.js 22 or newer and an API key/provider supported by Cline.

```bash
cp .env.example .env
# Edit .env: set CLINE_PROVIDER_ID, CLINE_MODEL_ID (if needed), CLINE_API_KEY,
# and CLINE_WORKSPACE_ROOT to your project directory.
npm install
npm run dev
```

Open http://localhost:5173, then paste the access token printed by the server terminal. The token is generated at each startup unless you set `CLINE_MOBILE_TOKEN` in `.env`.

## Use from your phone on the same private network

1. Keep the computer and phone on a trusted private network.
2. Set `CLINE_HOST=0.0.0.0` and add the Vite origin using the computer's LAN IP to `WEB_ORIGINS` (for example `http://192.168.1.20:5173`).
3. Run `npm run dev`, then open `http://<computer-LAN-IP>:5173` on the phone and enter the printed token.
4. Install the PWA from your mobile browser's menu if offered.

The development server is for trusted LAN testing only. Do not forward port 3001 or expose it directly to the public internet. For remote use, put the app behind HTTPS and strong authentication, preferably on a private overlay network such as Tailscale. Browser PWA installation and service workers require a secure context (HTTPS, except localhost).

## Runtime and safety

- The backend uses the official `@cline/sdk` ClineCore runtime; it does not shell out to a prompt-derived command.
- The SDK uses the configured local workspace and can edit files or run tools. Read-only file/search tools are auto-approved; other tools require approval in the authenticated web client and are denied if approval times out.
- Never share the access token. Anyone who has it can control the configured agent/workspace.
- Sessions/messages are currently held in server memory by this UI adapter. Cline's runtime persists its own session data, but this starter does not yet restore the UI transcript after a server restart.

## Current API

- `GET /health`
- `GET /api/sessions`
- `POST /api/sessions`
- `GET /api/sessions/:sessionId/messages`
- `POST /api/sessions/:sessionId/messages` with `{ "content": "..." }`
- `POST /api/approvals/:requestId` with `{ "approved": true | false }`

All `/api` endpoints and Socket.IO connections require the bearer token. This is an MVP foundation, not a fully audited production service. Before public deployment, add durable UI history, per-user authentication/authorization, rate limiting, TLS termination, and security testing.
