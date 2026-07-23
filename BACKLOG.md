# Backlog — nats-lens

Sorgente unica dei todo. Id stabili `NL-n`; spuntare, non cancellare.

## v0.2

- [ ] **NL-1 — Browse messaggi di uno stream**: get per sequenza/ultimo per subject, apertura come documento (JSON pretty).
- [ ] **NL-2 — Publish con headers**: input opzionale `k=v` multipli.
- [ ] **NL-3 — Riconnessione automatica**: gestire gli eventi di disconnessione del client (oggi la status bar resta "connected" se il server cade).

## v0.3+

- [ ] **NL-4 — Operazioni JetStream con conferma**: purge stream, delete consumer (doppia conferma, mai di default).
- [ ] **NL-5 — KV / Object Store browser**: bucket KV come tree, get/put valori.
- [ ] **NL-6 — Monitor `$SYS`**: eventi server (connessioni, ecc.) in un canale dedicato, richiede context con permessi di sistema.

## Rilascio

- [ ] **NL-7 — Publish sul Marketplace**: publisher reale in `package.json`, icona PNG 128px, screenshot/GIF nel README, `vsce publish`.
