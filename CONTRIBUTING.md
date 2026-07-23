# CONTRIBUTING — nats-lens

Standard di contributo e Test-Driven Development (TDD)

Principi

- Il progetto adotta TDD come standard: ogni nuova feature o bugfix che modifica comportamento deve essere accompagnata da test automatici che esercitano il comportamento atteso.
- I test devono essere eseguibili con `npm test` e devono passare in CI prima di poter essere rilasciati.
- Le PR devono includere descrizione, passi per la validazione locale (build/test), e il riferimento al backlog item `NL-<n>` quando applicabile.

Linee guida pratiche

1. Scrivi un test che fallisce e che descrive il comportamento desiderato.
2. Implementa la minima modifica necessaria per far passare il test.
3. Refactor: pulisci il codice mantenendo i test verdi.
4. Aggiungi il test al repository sotto `test/` (seguire lo stile esistente) e aggiorna `package.json` se necessario.

CI

- Il workflow CI (`.github/workflows/ci.yml`) esegue `npm ci`, `npm run build` e `npm test`. I fallimenti impediscono merge su `main` (branch protection va configurata dall'utente).

Pubblicazione

- La pubblicazione automatica su VS Code Marketplace è attivata da tag semantici `v*` attraverso `.github/workflows/publish.yml` e richiede il segreto `VSCE_TOKEN` impostato nel repository settings. L'azione esegue `npm run build` e `npx vsce publish --pat ${{ secrets.VSCE_TOKEN }}`.

Grazie per contribuire — segui TDD e manteniamo alta la qualità del progetto.
