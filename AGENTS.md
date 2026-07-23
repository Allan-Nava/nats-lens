# AGENTS.md — nats-lens

Estensione VS Code **NATS Lens**: client NATS nell'editor — connessione dai context della CLI `nats`, publish/subscribe/request, browser JetStream. TypeScript + esbuild, runtime dep solo `nats`.

Questo file definisce le regole operative per gli agent (Copilot, Claude, altri tool AI) quando lavorano in questo repository.

## Regole di lavoro (SEMPRE)

- **Ogni commit = release taggata `vX.Y.Z`**: nuova sezione in `CHANGELOG.md` (Keep a Changelog, in italiano) + `git tag -a vX.Y.Z -m "Release X.Y.Z"`. Bump `minor` per novita' sostanziali, `patch` per fix. Il `version` di package.json deve coincidere col tag. **Esenti**: auto-commit su `.claude/settings.json` e commit `report:` CI.
- **MAI `git push`**: lo fa sempre l'utente. MAI `Co-Authored-By` nei commit.
- **Gate prima di chiudere**: `npx tsc --noEmit` + `npm test` verdi (stessi check della CI).
- **Logica nel core puro** `src/core/` (MAI import `vscode` li') con test in `test/run.ts`; `src/extension.ts` e' solo glue UI.
- **SICUREZZA CREDENZIALI**: i context in `~/.config/nats/context` contengono password/token reali. MAI stamparli/loggarli/mostrarli — sempre `redactedLabel()` (test-guarded). Nei test MAI connettersi ai server dei context reali: solo il nats-server usa-e-getta locale.
- **Todo -> `BACKLOG.md`** (item con id stabile `NL-n`), niente TODO sparsi.

## Comandi

- `npm run build` (bundle), `npm test` (unit + integrazione con nats-server locale), `npx tsc --noEmit` (typecheck)
- `.vsix` locale: `npx @vscode/vsce package --no-dependencies`
- Integrazione: serve `nats-server` nel PATH; se manca i test si saltano con notice. In CI viene scaricato pinnato (v2.10.24).

## Trappole note

- `renderPayload` euristica binario (>10% replacement char): non modificarla senza aggiornare il test.
- Chiudere le subscription su disconnect/deactivate (`ActiveSubs.stopAll()`).
- `test/run.ts` senza top-level await (per tsc e' CJS): tutto dentro `main()`.
- Porta del server di test random con attesa attiva — niente sleep fissi.
- `publisher` in package.json e' placeholder: allinearlo prima del publish Marketplace.

## Puntatori

- Backlog: `BACKLOG.md` - CI: `.github/workflows/ci.yml` - Repo gemello: `~/projects/github.com/ansible-vars-lens`
