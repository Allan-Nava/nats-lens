# Changelog

## Unreleased

- CI: Fix `backlog-sync` workflow to use `github.request` for listing milestones (prevents TypeError in actions/github-script)

## 0.1.0

- Connections view fed by `nats` CLI contexts (`~/.config/nats/context`), credentials never displayed.
- Connect/disconnect with status-bar indicator.
- JetStream browser: streams (messages, bytes, subjects) and consumers (pending, ack-pending).
- Subscribe with wildcards into per-subject Output channels; JSON pretty-printing, header display, binary detection.
- Publish and request-reply commands with subject validation.
