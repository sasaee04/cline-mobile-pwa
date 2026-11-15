# Cline Mobile PWA Starter

This project is a starter for a desktop-hosted Cline core with a mobile-friendly web/PWA frontend.

## What this is

This is not a direct Android port of the VS Code extension. Instead, it follows the correct architecture:

- Keep the real Cline runtime on a computer/server
- Expose a chat API to the browser and phone
- Deliver a PWA or web client for mobile devices

## Architecture

- Server: Express + Socket.IO
- Client: React + Vite
- Mobile: installable PWA
- Runtime adapter: configurable local CLI or external agent service

## Quick start

```bash
npm install
npm run dev
```

Open the web app at:

- http://localhost:5173

Check the API at:

- http://localhost:3001/health

## Runtime adapter

The current backend supports two modes:

1. mock mode (default)
2. exec mode via a configured command

Set environment variables before launching the app:

```bash
export CLINE_RUNTIME_MODE=exec
export CLINE_RUNTIME_COMMAND="/path/to/your/cli"
export CLINE_RUNTIME_ARGS="--flag --other"
```

Then run:

```bash
npm run dev
```

If you do not set the runtime variables, the app will remain in mock mode and return a helpful message instead of failing unexpectedly.

## Why this is the right architecture

The official Cline project is built around VS Code extension APIs, desktop host behavior, and editor workflows. Those are not directly portable to Android. The correct pattern is to keep the Cline runtime on a host and use a remote UI. This gives you:

- real agent logic on a computer/server
- mobile-friendly access via browser or PWA
- lower technical risk than porting the editor extension itself

## Next steps

- connect the runtime adapter to the real Cline CLI or SDK
- add user auth and session persistence
- add approval tracking for tool actions
- add deployment hosting for production mobile access
