# BACKLOG — nats-lens

Questo file è la sorgente di verità per il backlog del progetto. Un workflow GitHub Actions lo sincronizzerà con Issues e Milestones.

## Milestone: v0.1 (MVP)

- [ ] NL-1: Browse JetStream streams — Permettere la navigazione e l'elenco di stream JetStream (nome, soggetti, messaggi recenti).
- [ ] NL-2: Publish/Subscribe UI — Interfaccia per pubblicare messaggi e creare sottoscrizioni dalla estensione.
- [ ] NL-3: Request/Reply helper — Helper per inviare request e visualizzare le reply con timeout configurabile.

## Milestone: v0.2 (Stabilità e UX)

- [ ] NL-4: Persistenza delle subscriptions — Salvataggio delle sottoscrizioni attive tra sessioni e indicazione stato nel tree.
- [ ] NL-5: Render payload migliorato — Migliorare `renderPayload` con preview JSON, testo e fallback binario (test coperti).
- [ ] NL-6: Test + CI — Aggiungere test automatizzati e workflow CI per `npm run build` e `npm test`.

## Convenzione backlog

- Ogni elemento ha un ID stabile `NL-<n>`.
- Le voci sono fonte unica: modificare qui per cambiare lo stato/descrizione; la sync aggiornerà Issues/Milestones.
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
