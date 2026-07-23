# CLAUDE.md — nats-lens

Estensione VS Code **NATS Lens** (`github.com/Allan-Nava/nats-lens`): client NATS nell'editor — connessione dai context della CLI `nats`, publish/subscribe/request sui subject, browser JetStream (stream e consumer). TypeScript + esbuild, dipendenza runtime solo `nats`.

## Regole di lavoro (SEMPRE)

- **Ogni commit = release taggata `vX.Y.Z`**: nuova sezione in `CHANGELOG.md` (Keep a Changelog, in italiano) + `git tag -a vX.Y.Z -m "Release X.Y.Z"`. Bump `minor` per novità sostanziali, `patch` per fix. Senza chiederlo. Il campo `version` di `package.json` deve coincidere col tag (vsce lo pretende). **Esenti**: auto-commit su `.claude/settings.json` e commit `report:` delle build CI.
- **MAI `git push`** — lo fa sempre l'utente. MAI `Co-Authored-By` nei commit.
- **Gate prima di chiudere**: `npx tsc --noEmit` + `npm test` verdi (stessi check della CI).
- **La logica va nel core puro** (`src/core/` — MAI import `vscode` lì) con test in `test/run.ts`; `src/extension.ts` è solo glue UI.
- **SICUREZZA CREDENZIALI**: i context in `~/.config/nats/context` contengono password/token reali. MAI stamparli, loggarli o mostrarli in UI — usare sempre `redactedLabel()`; c'è un test che fallisce se la label contiene la password. Nei test MAI connettersi ai server dei context reali (produzione): solo il nats-server usa-e-getta locale.
- **Todo → `BACKLOG.md`** (sorgente unica, item con id stabile `NL-n`). Non sparpagliare TODO nei commenti.

## Comandi

```bash
npm run build            # bundle esbuild → dist/extension.js
npm test                 # unit + integrazione (spawna nats-server locale su porta random)
npx tsc --noEmit         # typecheck (esbuild non typecheckka)
npx @vscode/vsce package --no-dependencies   # .vsix locale
```

F5 apre l'Extension Host. L'integrazione richiede `nats-server` nel PATH (`brew install nats-server`); se manca, i test di integrazione si saltano con notice (mai errore). In CI il binario viene scaricato pinnato (v2.10.24) — vedi `ci.yml`.

## Architettura

- `src/core/contexts.ts` — parser dei context CLI (`*.json`, selezione da `../context.txt`, skip `.bak`/broken); `redactedLabel()` per label sicure.
- `src/core/client.ts` — wrapper `nats.js`: connect (user/pass, token, creds), rtt/info, publish, request, subscribe, list stream/consumer JetStream.
- `src/core/payload.ts` — render payload (JSON pretty, testo, binario euristico), riga di log messaggi, validazione subject (`*`, `>` solo finale).
- `src/extension.ts` — tree (context → JetStream → stream → consumer; sezione Subscriptions), Output channel per subject sottoscritto, status bar, comandi.
- `test/run.ts` — unit (context/payload/subject) + integrazione: spawna `nats-server -js -p <random>` in tmp, pub/sub roundtrip, stream+consumer, request timeout; teardown sempre.

## Trappole note / regole tecniche

- **`renderPayload` euristica binario**: >10% replacement char → `<binary>`; non "migliorarla" senza aggiornare il test.
- Le subscription vive vanno chiuse su disconnect/deactivate (`ActiveSubs.stopAll()`), altrimenti l'Output channel resta appeso.
- `test/run.ts` NON può usare top-level await (per tsc è CJS): tutto dentro `main()`. Bundle test ESM con banner `createRequire` in `esbuild.mjs`.
- La porta del server di test è random (42000–42999) con attesa attiva sul connect — niente sleep fissi.
- Il `publisher` in `package.json` è un placeholder: allinearlo al publisher Marketplace reale prima di `vsce publish`.
- `nats.js` v2 è pure-JS (nkeys/tweetnacl inclusi): il bundle esbuild lo ingloba, non serve `--external`.

## Puntatori

- Backlog: `BACKLOG.md` · CI: `.github/workflows/ci.yml` (test su push/PR; tag `v*` → vsix in release)
- Repo gemello (stesso scaffold/pattern): `~/projects/github.com/ansible-vars-lens`
- Context NATS reali (NON usare nei test): `~/.config/nats/context/`
