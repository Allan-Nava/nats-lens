# BACKLOG — nats-lens

Sorgente unica dei todo. ID stabili `NL-n` (mai riusare un numero). Spuntare `[x]`, non cancellare.
Un workflow GitHub Actions (`backlog-sync.yml`) sincronizza questo file con Issues/Milestones.

## v0.1 — MVP (fatto)

- [x] **NL-1 — Browse JetStream streams**: elenco stream (nome, soggetti, messaggi/byte) e consumer nel tree.
- [x] **NL-2 — Publish/Subscribe UI**: pubblicazione messaggi e sottoscrizioni dall'estensione.
- [x] **NL-3 — Request/Reply helper**: request con timeout, reply aperta come documento.
- [x] **NL-4 — Test + CI**: unit + integrazione (nats-server usa-e-getta) e workflow CI.
- [x] **NL-5 — Render payload**: JSON pretty / testo / fallback binario euristico.

## Rilascio

- [ ] **NL-6 — Publish sul Marketplace**: pipeline tag-driven pronta (`ci.yml`, allineata ad ansible-vars-lens). Restano: secret `VSCE_PAT`, verifica publisher, screenshot/GIF nel README, tag `vX.Y.Z`.

## v1.2 — Messaging power tools (fatto)

- [x] **NL-14 — Publish con headers**: parsing `k=v` / `k: v` (multi-valore, righe vuote ignorate, errori riportati) e invio reale degli header NATS. Core `parseHeaders()` + `client.publish`; prompt header nel comando publish.
- [x] **NL-15 — Filtro subject lato client**: `subjectMatches(pattern, subject)` con semantica wildcard NATS (`*` un token, `>` coda); filtro opzionale nel comando subscribe.
- [x] **NL-16 — Preview payload troncata**: `previewPayload()` limita i messaggi grandi (cap 4000 char nell'Output) con nota sulla dimensione totale.

## v0.2+ — Stabilità e UX

- [x] **NL-7 — Riconnessione automatica**: `NatsClient` espone `connectionState` (`connected`/`reconnecting`/`closed`) via gli eventi di stato di nats.js; status bar e tree riflettono la caduta del server (spinner "reconnecting…").
- [ ] **NL-8 — Persistenza subscriptions**: salvataggio delle sottoscrizioni attive tra sessioni e stato nel tree.
- [x] **NL-9 — Operazioni JetStream con conferma**: purge stream e delete consumer (`client.purgeStream`/`deleteConsumer`), con doppia conferma modale (mai di default) dal menu contestuale del tree.

## v0.3+ — Advanced

- [ ] **NL-10 — KV / Object Store browser**: bucket KV come tree, get/put valori.
- [ ] **NL-11 — Monitor `$SYS`**: eventi server (connessioni, ecc.) in un canale dedicato; richiede context con permessi di sistema.
- [ ] **NL-12 — Stream message replay**: cerca/riproduci messaggi storici (time/range/seq), apertura come documento.
- [ ] **NL-13 — JetStream consumer management**: creare/modificare/eliminare consumer (pull/ephemeral/durable).
- [ ] **NL-17 — Message inspector & schema validation**: visualizzatore avanzato con validazione JSON Schema e preview raw/base64.
- [ ] **NL-18 — Export/Import subscriptions**: esporta le subscriptions attive su file e reimport per ripristino rapido.
- [ ] **NL-19 — Credential helper UI**: usare `.creds`/token senza mostrare segreti, gestione sicura delle credenziali.
- [ ] **NL-20 — Telemetria opt-in**: metriche d'uso anonime per performance/stabilità, toggle opt-in.
