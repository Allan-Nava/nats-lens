---
title: Sviluppo e rilascio
---

# Sviluppo e rilascio

[← Torna alla home](index.html) · [Guida all'utilizzo](USAGE.html)

## Prerequisiti

- Node.js 20
- `nats-server` nel PATH per i test d'integrazione (`brew install nats-server`).
  Se manca, i test d'integrazione si **saltano** con un avviso (mai errore).

## Comandi

```bash
npm install                                    # dipendenze
npm run build                                  # esbuild (extension + webview) + Tailwind CSS
npm run watch                                  # build in watch
npm test                                       # unit + integrazione (nats-server locale, porta random)
npm run typecheck                              # tsc extension + tsc webview (JSX/DOM)
npx @vscode/vsce package --no-dependencies     # .vsix locale
```

La **dashboard webview** (React) vive in `src/webview/` ed è un secondo target esbuild
(`dist/webview.js`) con CSS Tailwind mappato sulle variabili `--vscode-*` (`dist/webview.css`);
il view-model puro è in `src/core/dashboard.ts` (testato). L'extension host resta con la sola
dipendenza runtime `nats`: React/Tailwind sono devDependencies bundlate nell'asset statico.

Premi **F5** in VS Code per aprire l'Extension Host e provare l'estensione.

## Architettura

- `src/core/` — **logica pura, senza import `vscode`** (testabile con Node):
  - `contexts.ts` — parser dei context CLI + `redactedLabel()` (mai credenziali in chiaro).
  - `client.ts` — wrapper `nats.js`: connect, stato connessione (`connectionState`), publish, request,
    subscribe, JetStream (list/purge/delete).
  - `payload.ts` — render payload (JSON/testo/binario), riga di log, match subject, validazione subject.
  - `headers.ts` — parsing header `k=v` / `k: v`.
- `src/extension.ts` — **glue UI**: tree, comandi, status bar, Output channel.
- `test/run.ts` — unit + integrazione (spawna un `nats-server` usa-e-getta).

## Gate (prima di ogni commit)

`npx tsc --noEmit` e `npm test` devono essere **verdi** — sono gli stessi check della CI.
La logica nuova va nel core con relativo test.

## CI/CD

`.github/workflows/ci.yml` (guidato dai tag):

| Job | Quando | Cosa fa |
|---|---|---|
| `test` | push/PR | install `nats-server` + `npm test` |
| `type-check` | push/PR | `tsc --noEmit` |
| `build` | dopo test+type-check | bundle + controllo dimensione |
| `package` | tag `v*` | `.vsix` allegato alla release GitHub |
| `publish-marketplace` | tag `v*` | `vsce publish` con `secrets.VSCE_TOKEN` (env `marketplace`) |

## Rilascio

1. Bump `version` in `package.json` + nuova sezione in `CHANGELOG.md` (Keep a Changelog, in italiano).
2. Commit, poi tag annotato: `git tag -a vX.Y.Z -m "Release X.Y.Z"` (la `version` deve coincidere col tag).
3. `git push origin main && git push origin vX.Y.Z` → parte package + publish.

Prerequisiti Marketplace: publisher `allannava95` e secret `VSCE_TOKEN` (PAT Azure DevOps con
scope *Marketplace → Manage*). Verifica con `npx @vscode/vsce verify-pat allannava95`.
Il job `publish-marketplace` fallisce se `VSCE_TOKEN` manca, così un tag non può risultare
pubblicato senza aver eseguito davvero il rilascio.

La telemetria è disattivata di default. Per abilitarla serve configurare
`natsLens.telemetryEndpoint` con un URL HTTPS e confermare il comando **Enable Anonymous
Telemetry**. Il client invia solo conteggi aggregati di operazioni riuscite; non raccoglie
subject, payload, URL dei server o credenziali.

## Roadmap v1.12

La prossima milestone pianificata è **v1.12 — Future features**:

- gestione completa degli stream, inclusi retention e storage;
- pausa/ripresa, ack/nack, reset e replay dei consumer;
- watch live e storico revisioni per KV;
- delete, metadata e download a multiparti per Object Store;
- auto-refresh, filtri e grafici di throughput nella dashboard;
- preview raw/base64 nell'inspector.

## Documentazione

Il sito che stai leggendo è servito da `docs/` (Jekyll) e ri-deployato a ogni push su `main`
da `.github/workflows/pages.yml`. **Ogni modifica funzionale va riflessa in `docs/` nello stesso commit.**
