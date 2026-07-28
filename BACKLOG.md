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
- [x] **NL-8 — Persistenza subscriptions**: i subject sottoscritti sono salvati in `workspaceState` e ripristinati al connect successivo.
- [x] **NL-9 — Operazioni JetStream con conferma**: purge stream e delete consumer (`client.purgeStream`/`deleteConsumer`), con doppia conferma modale (mai di default) dal menu contestuale del tree.

## v0.3+ — Advanced

- [x] **NL-10 — KV browser**: `client.kvBuckets/kvKeys/kvGet/kvPut`; sezione Key-Value nel tree (bucket → chiavi), lettura valore come documento e comando **Set KV Value**. Object Store: follow-up.
- [x] **NL-11 — Monitor `$SYS`**: comando **Monitor $SYS Events** che sottoscrive `$SYS.>` in un canale dedicato (richiede context con permessi di sistema).
- [x] **NL-12 — Stream message replay**: `client.getStreamMessage()` per seq o last-by-subject; comando **Read Stream Message** dal menu dello stream, apertura come documento (JSON/testo).
- [x] **NL-13 — JetStream consumer management**: `client.addConsumer()` (durable, ack/deliver policy, filter subject) + delete già presente (NL-9); comando **Create Consumer** dal menu dello stream. Modifica consumer: follow-up.
- [x] **NL-17 — Schema validation**: `validateJson()` (subset JSON Schema: type/required/properties/items/enum, dependency-free); comando **Validate JSON against Schema** sull'editor attivo. Preview raw/base64: follow-up.
- [x] **NL-18 — Export/Import subscriptions**: core `serializeSubscriptions`/`parseSubscriptions` (JSON versionato, subject validati); comandi **Export/Import Subscriptions** su file.
- [x] **NL-19 — Credential helper UI**: comando **Connect with Token…** — token mascherato all'input, tenuto solo in memoria, mai persistito né loggato. (Persistenza sicura via SecretStorage: follow-up.)
- [ ] **NL-20 — Telemetria opt-in**: *non implementata di proposito.* Richiederebbe un endpoint di raccolta e una decisione di prodotto su privacy/consenso; non aggiungo codice che trasmette dati senza quel design. Da riaprire con una scelta esplicita.

## v1.6 — Inspector & consumer tuning

- [x] **NL-21 — Payload inspector (base64/hex)**: core `toBase64`/`toHex`; comando **Inspect Payload as base64/hex** sull'editor attivo.
- [x] **NL-22 — Modifica consumer**: `client.updateConsumer()` (`max_deliver`/`ack_wait`); comando **Modify Consumer** dal menu del consumer.
- [x] **NL-23 — Object Store browser**: `client.osBuckets/osList/osGet/osPut` (via `putBlob`/`getBlob`); sezione **Object Store** nel tree (bucket → oggetti), apertura oggetto e **Upload Object** da file.

## v1.7 — GUI: Webview dashboard + native polish

Direzione scelta: **Webview dashboard React/shadcn** come centro operativo, affiancato dal
polish della UI nativa. Nota architetturale: la webview introduce un **secondo target di build**
(React → asset statici nel `.vsix`) e devDependencies (react/react-dom, tailwind o CSS con
variabili tema VS Code). La regola "dipendenza **runtime** solo `nats`" resta valida per
l'extension host: gli asset webview sono bundle statici, non richieste a runtime. I componenti
shadcn vanno adattati al tema VS Code (`var(--vscode-*)`), niente CDN (CSP con nonce).

### Fondamenta
- [x] **NL-24 — Webview scaffold**: secondo target esbuild (`dist/webview.js`) React + Tailwind su variabili `--vscode-*` (`dist/webview.css`); comando **Open Dashboard** con `WebviewPanel`, CSP+nonce, bridge tipizzato (`InboundMessage`/`OutboundMessage`); view-model `buildDashboardModel` nel core (TDD). Dashboard iniziale con stato connessione + card conteggi.

### Pannelli dashboard
- [x] **NL-25 — Publish/Request panel**: tab con subject, payload, header `k=v`; invio publish/request via bridge e reply/ack inline.
- [x] **NL-26 — Subscribe live-tail panel**: tab con subject + filtro, subscribe/unsubscribe, lista messaggi live (subscription della dashboard chiuse alla dispose del panel).
- [x] **NL-27 — Message inspector panel**: tab con pretty JSON / base64 / hex + validazione JSON Schema, tutto client-side (riusa `validateJson`/`toBase64`/`toHex`/`renderPayload` bundlati).
- [x] **NL-28 — Overview panel**: card conteggi + tabelle Streams / KV / Object Store dal view-model `buildDashboardModel` (liste).

### Polish UI nativa
- [ ] **NL-29 — Welcome / empty states**: `viewsWelcome` quando disconnesso/senza context, con pulsanti Connect / Connect with Token.
- [ ] **NL-30 — Tooltip & badge ricchi**: `MarkdownString` su stream/consumer/bucket con dettagli; badge conteggi e colori di stato.
- [ ] **NL-31 — Organizzazione & ordinamento**: ordinamento configurabile, memoria stato collapse, filtro/ricerca nel tree.
- [ ] **NL-32 — Quick actions & status bar**: status bar cliccabile con QuickPick di azioni rapide; menu contestuali coerenti.
