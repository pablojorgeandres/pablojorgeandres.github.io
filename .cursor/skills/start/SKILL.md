---
name: start
description: Starts the local static server for tienda-nimu. Use when the user starts a message with /start.
---

# /start

When the user starts a message with `/start`, start the project locally.

Strip the `/start` prefix; ignore any leftover text unless it changes port.

## How to run

Static site (HTML/CSS/JS). No install, no build. Needs an HTTP server because the app `fetch`es JSON under `data/`.

1. Check if a server is already running on the project (look at terminals).
2. If not, from the repo root:

```bash
python3 -m http.server 8000
```

3. Tell the user to open: `http://localhost:8000`

## Rules

- Do not invent a build step or package manager.
- Prefer port `8000`; if busy, use the next free port and say which one.
- If the server is already up, do not start a second one — just report the URL.
- Keep the reply short.
