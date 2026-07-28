---
title: Guida all'utilizzo
description: Come usare NATS Lens — installazione, context, connessione, publish/subscribe/request, JetStream.
---

# NATS Lens — Guida all'utilizzo

[← Torna alla home](index.html) · [Sviluppo e rilascio](DEVELOPMENT.html)

Client NATS dentro VS Code: ti connetti con i **context della CLI `nats`** che hai già,
pubblichi/sottoscrivi/richiedi sui subject e sfogli **JetStream** (stream e consumer)
senza uscire dall'editor.

---

## 1. Installazione

- **Da Marketplace**: cerca *NATS Lens* (`allannava95.nats-lens`) e installa.
- **Da `.vsix`**: `code --install-extension nats-lens-<versione>.vsix`
  (oppure Command Palette → *Extensions: Install from VSIX…*).

Requisiti: VS Code ≥ 1.85. Nessun runtime esterno — il client `nats.js` è incluso nel bundle.

---

## 2. Preparare i context

NATS Lens **non gestisce credenziali proprie**: riusa i context della CLI `nats`, letti da
`~/.config/nats/context/*.json`. Se usi già la CLI, sei a posto. Per crearne uno:

```bash
nats context add prod \
  --server nats://nats.example.com:4222 \
  --user app --password '••••••'
nats context select prod          # il context selezionato viene evidenziato in NATS Lens
```

Auth supportata per context: **user/password**, **token**, file **`.creds`** (JWT).
Le credenziali servono solo per connettersi e **non vengono mai mostrate** nell'UI
(le label usano una forma oscurata, es. `nats://host:4222 (user app)`).

> **Cartella diversa?** Impostazione `natsLens.contextsDir`.
> **Server senza context?** Aggiungili in `natsLens.extraServers` (es. `nats://localhost:4222`).

---

## 3. Connettersi

1. Apri la **activity bar → icona NATS** → vista **Connections**.
2. Clicca un context (o Command Palette → **NATS Lens: Connect to Context**).
3. La **status bar** in basso mostra lo stato:
   - `$(broadcast) <context>` — connesso
   - `$(sync~spin) NATS: reconnecting…` — il server è caduto, tentativi in corso
   - `$(plug) NATS: off` — disconnesso / chiuso

Disconnessione: **NATS Lens: Disconnect** (chiude anche tutte le subscription attive).

---

## 4. Pubblicare, sottoscrivere, richiedere

### Publish
Command Palette → **NATS Lens: Publish Message**.
- **Subject**: validato (niente spazi; niente wildcard in publish).
- **Payload**: testo o JSON (memorizzato per subject, riproposto la volta dopo).
- **Headers** (opzionali): una per riga, formato `k=v` **oppure** `k: v`.
  Chiavi ripetute → valori multipli. Righe con errori bloccano l'invio con un messaggio.

```
trace-id: abc-123
x-retry=0
x-retry=1
```

### Subscribe
Command Palette → **NATS Lens: Subscribe to Subject**.
- **Subject** con wildcard: `*` (un token), `>` (uno o più token finali). Es. `orders.*.created`, `logs.>`.
- **Filtro opzionale** lato client: restringe cosa appare nell'Output senza cambiare la subscription.
- I messaggi arrivano in un **Output channel dedicato** (`NATS: <subject>`):
  JSON stampato indentato, header mostrati tra `{}`, binario rilevato, payload grandi troncati
  (con nota sui byte totali) per non intasare il canale.

Le subscription attive compaiono sotto **Subscriptions** nel tree; fermane una con
**NATS Lens: Stop a Subscription** o dal menu contestuale.

I subject sottoscritti sono **persistiti tra sessioni** (workspace) e **ripristinati** alla
riconnessione. Puoi anche **esportarli/importarli** su file JSON con
**NATS Lens: Export/Import Subscriptions**.

### Request / Reply
Command Palette → **NATS Lens: Send Request (request-reply)**.
Inserisci subject e payload: la reply si apre come documento. Timeout di default 3s;
senza responder ottieni un errore esplicito.

---

## 5. JetStream

Da connesso, espandi **JetStream** nel tree:

- **Stream** → nome, `N msg · dimensione · subjects`.
- Espandi uno stream → **consumer** con `pending` e `ack pending`.

### Leggere i messaggi di uno stream
Dal menu contestuale di uno stream (icona documento) o Command Palette → **NATS Lens: Read Stream Message**:

- **By sequence** — recupera il messaggio con un dato numero di sequenza.
- **Last by subject** — recupera l'ultimo messaggio su un subject (wildcard ammesse).

Il messaggio si apre come documento con un'intestazione (`seq`, subject, timestamp, header)
e il payload renderizzato (JSON indentato o testo).

### Creare / modificare un consumer
Dal menu contestuale di uno stream (icona `+`) o Command Palette → **NATS Lens: Create Consumer**:
nome durable, **ack policy** (`explicit`/`all`/`none`), **deliver policy** (`all`/`new`/`last`)
e un **filter subject** opzionale. Il consumer creato compare subito nel tree.

Dal menu di un consumer (icona ingranaggio) → **NATS Lens: Modify Consumer** per aggiornare
`max deliver` e `ack wait` (ms) di un consumer esistente.

### Operazioni distruttive (doppia conferma)
Dal menu contestuale (icona cestino / tasto destro):

- **Purge Stream** — svuota tutti i messaggi dello stream.
- **Delete Consumer** — elimina un consumer.

Entrambe richiedono **due conferme modali** e **non sono mai l'azione di default** —
il pulsante predefinito è Annulla. L'operazione non è reversibile.

---

## 5b. Key-Value (KV)

Da connesso, espandi **Key-Value** nel tree: mostra i **bucket** KV (`N values · dimensione`);
espandi un bucket per vederne le **chiavi**.

- **Leggi un valore** — clicca una chiave: il valore si apre come documento (JSON/testo) con `rev`.
- **Scrivi un valore** — dal menu del bucket (icona matita) o Command Palette → **NATS Lens: Set KV Value**:
  bucket (esistente o nuovo), key, value. Restituisce la nuova revisione.

---

## 5c. Object Store

Da connesso, espandi **Object Store** nel tree: bucket → oggetti (`dimensione`).

- **Apri un oggetto** — clicca un oggetto: il contenuto si apre come documento.
- **Carica un oggetto** — dal menu del bucket (icona upload) → **NATS Lens: Upload Object**: scegli un file, viene salvato con il suo nome.

### Ispezione payload (base64/hex)
Command Palette → **NATS Lens: Inspect Payload as base64/hex**: codifica i byte del documento
attivo in base64 o esadecimale (utile per contenuti binari).

---

## 5d. Dashboard & UI

- **Dashboard** (comando **Open Dashboard**, o icona nella toolbar della view): pannello webview con tab
  **Overview** (conteggi + tabelle Streams/KV/Object Store), **Publish** (publish/request), **Subscribe**
  (live-tail con filtro) e **Inspect** (pretty JSON / base64 / hex + validazione JSON Schema). Eredita il tema di VS Code.
- **Status bar** cliccabile → **Quick Actions** (menu rapido: Dashboard, Connect, Publish, Subscribe, Filter…).
- **Filter Tree** (icona filtro nella toolbar): filtra context/stream/bucket per nome; lo stato di espansione dei nodi è ricordato.
- Quando non c'è alcun context, la view mostra una **welcome** con i pulsanti per connetterti.

## 6. Comandi (riassunto)

| Comando | Cosa fa |
|---|---|
| `NATS Lens: Open Dashboard` | Apre la dashboard webview (Overview/Publish/Subscribe/Inspect) |
| `NATS Lens: Quick Actions` | Menu rapido di azioni (anche dalla status bar) |
| `NATS Lens: Filter Tree` | Filtra i nodi del tree per nome |
| `NATS Lens: Connect to Context` | Scegli un context e connettiti |
| `NATS Lens: Connect with Token…` | Connessione ad-hoc con token mascherato (solo in memoria) |
| `NATS Lens: Disconnect` | Disconnetti e chiudi le subscription |
| `NATS Lens: Publish Message` | Pubblica un payload (con header opzionali) |
| `NATS Lens: Send Request (request-reply)` | Invia una request e apri la reply |
| `NATS Lens: Subscribe to Subject` | Live-tail di un subject in un Output channel |
| `NATS Lens: Stop a Subscription` | Ferma una subscription attiva |
| `NATS Lens: Read Stream Message` | Legge un messaggio dello stream (seq / last-by-subject) |
| `NATS Lens: Create Consumer` | Crea un consumer durable su uno stream |
| `NATS Lens: Modify Consumer` | Aggiorna max deliver / ack wait di un consumer |
| `NATS Lens: Purge Stream` | Svuota uno stream (doppia conferma) |
| `NATS Lens: Delete Consumer` | Elimina un consumer (doppia conferma) |
| `NATS Lens: Open KV Value` | Apre il valore di una chiave KV |
| `NATS Lens: Set KV Value` | Scrive una chiave in un bucket KV |
| `NATS Lens: Open Object` | Apre il contenuto di un oggetto Object Store |
| `NATS Lens: Upload Object` | Carica un file in un bucket Object Store |
| `NATS Lens: Inspect Payload as base64/hex` | Codifica il documento attivo in base64/hex |
| `NATS Lens: Export Subscriptions` | Salva le subscription attive su file JSON |
| `NATS Lens: Import Subscriptions` | Sottoscrive i subject da un file JSON |
| `NATS Lens: Validate JSON against Schema` | Valida il documento JSON attivo contro uno schema |
| `NATS Lens: Monitor $SYS Events` | Sottoscrive `$SYS.>` (richiede permessi di sistema) |
| `NATS Lens: Refresh` | Ricarica il tree |

## 7. Impostazioni

| Chiave | Default | Descrizione |
|---|---|---|
| `natsLens.contextsDir` | `""` | Cartella dei context CLI. Vuoto = `~/.config/nats/context`. |
| `natsLens.extraServers` | `[]` | URL server extra (`nats://host:4222`) mostrati accanto ai context. |

---

## 8. Problemi comuni

- **Non vedo context** → verifica `~/.config/nats/context/*.json` o imposta `natsLens.contextsDir`.
  I file non-JSON, `.bak` o corrotti vengono ignorati.
- **Status bar bloccata su "reconnecting…"** → il server non è tornato entro i tentativi;
  lo stato passa poi a `off`. Riconnetti quando il server è di nuovo su.
- **Connessione fallita** → controlla URL/credenziali del context; l'errore riporta il motivo.
- **JetStream vuoto o non disponibile** → il server potrebbe non avere JetStream abilitato,
  o l'account/context non ha i permessi.
