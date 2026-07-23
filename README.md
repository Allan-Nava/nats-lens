<p align="center">
  <img src="media/logo.png" alt="NATS Lens" width="128" height="128">
</p>

# NATS Lens

**A [NATS](https://nats.io) client inside VS Code** — connect with the contexts you already have from the `nats` CLI, publish/subscribe/request on subjects, and browse JetStream streams and consumers without leaving the editor.

📖 **[Guida all'utilizzo →](docs/USAGE.md)**

## Features

- **Your CLI contexts, zero config** — reads `~/.config/nats/context/*.json` (the `nats` CLI format: url, user/password, token, `.creds`); the CLI's selected context is highlighted. Credentials are used to connect and **never displayed**.
- **Connections view** — activity-bar panel with one click connect/disconnect; status bar shows the active connection.
- **JetStream browser** — streams with message/byte counts and subjects; expand a stream to see its consumers with pending/ack-pending counts.
- **Subscribe** — any subject (wildcards `*` and `>` supported): messages stream into a dedicated Output channel, JSON payloads pretty-printed, headers shown, binary detected. Active subscriptions are listed in the tree and can be stopped individually.
- **Publish / Request** — quick input boxes with subject validation; request replies open as a document.

## Commands

| Command | What it does |
|---|---|
| `NATS Lens: Connect to Context` | Pick a context and connect |
| `NATS Lens: Publish Message` | Publish a payload to a subject |
| `NATS Lens: Subscribe to Subject` | Live-tail a subject into an Output channel |
| `NATS Lens: Stop a Subscription` | Stop one of the active subscriptions |
| `NATS Lens: Send Request` | Request-reply with timeout |
| `NATS Lens: Disconnect` | Close the connection (and all subscriptions) |

## Settings

| Setting | Default | Description |
|---|---|---|
| `natsLens.contextsDir` | `~/.config/nats/context` | Where the CLI context JSON files live |
| `natsLens.extraServers` | `[]` | Extra `nats://` URLs shown alongside the contexts |

## Development

```bash
npm install
npm test             # unit tests + integration against a throwaway local nats-server
npm run build        # bundle to dist/
# F5 in VS Code launches the Extension Development Host
```

The core (context parsing, payload rendering, client wrapper) has no VS Code dependency and lives in `src/core/` — the integration test spins up `nats-server -js` on a random port, exercises pub/sub, JetStream listing and request-reply, then tears it down. If `nats-server` is not installed the integration tests are skipped.

## Branch protection & CI

We recommend protecting the `main` branch and requiring the CI workflow to pass before merging. Suggested protection rules:

- Require status checks to pass (select the `CI` workflow).
- Require pull request reviews before merge (1 or 2 reviewers).
- Dismiss stale pull request approvals when new commits are pushed.
- Restrict who can push to `main` (maintainers only).

These rules help enforce the TDD standard (`npm test`) and ensure releases are gated by passing CI.

## License

MIT
