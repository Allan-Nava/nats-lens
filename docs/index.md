---
title: NATS Lens
---

<p align="center">
  <img src="https://raw.githubusercontent.com/Allan-Nava/nats-lens/main/media/logo.png" alt="NATS Lens" width="128" height="128">
</p>

# NATS Lens

**Client [NATS](https://nats.io) dentro VS Code** — ti connetti con i **context della CLI `nats`**
che hai già, pubblichi/sottoscrivi/richiedi sui subject e sfogli **JetStream** (stream e consumer)
senza uscire dall'editor.

[![Marketplace](https://img.shields.io/visual-studio-marketplace/v/allannava95.nats-lens?label=Marketplace)](https://marketplace.visualstudio.com/items?itemName=allannava95.nats-lens)

---

## Documentazione

- 📖 **[Guida all'utilizzo](USAGE.md)** — installazione, context, connessione, publish/subscribe/request, JetStream.
- 🛠️ **[Sviluppo e rilascio](DEVELOPMENT.md)** — build, test, packaging, pipeline di pubblicazione.

## In breve

- **Context CLI, zero config** — legge `~/.config/nats/context/*.json` (url, user/password, token, `.creds`).
  Le credenziali servono solo per connettersi e **non vengono mai mostrate**.
- **Connessione** con indicatore in status bar (connesso / *reconnecting…* / off).
- **Publish** con header opzionali, **Subscribe** con wildcard + filtro client-side, **Request/Reply**.
- **JetStream**: stream (msg, byte, subjects) e consumer (pending, ack pending);
  **purge stream** e **delete consumer** con doppia conferma.

## Installazione rapida

```bash
# da Marketplace: cerca "NATS Lens" (allannava95.nats-lens)
# oppure da .vsix:
code --install-extension nats-lens-<versione>.vsix
```

## Link

- Repository: [github.com/Allan-Nava/nats-lens](https://github.com/Allan-Nava/nats-lens)
- Issue / backlog: [Issues](https://github.com/Allan-Nava/nats-lens/issues)
- Changelog: [CHANGELOG.md](https://github.com/Allan-Nava/nats-lens/blob/main/CHANGELOG.md)
