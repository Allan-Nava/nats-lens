---
title: NATS Lens
description: Client NATS dentro VS Code — context CLI, publish/subscribe/request, browser JetStream.
---

<section class="hero">
  <img class="logo" src="logo.png" alt="NATS Lens">
  <h1>NATS Lens</h1>
  <p class="tag">Un client <a href="https://nats.io">NATS</a> dentro VS Code: usa i context della CLI <code>nats</code> che hai già, pubblica/sottoscrivi/richiedi sui subject e sfoglia JetStream — senza uscire dall'editor.</p>
  <div class="badges">
    <a href="https://marketplace.visualstudio.com/items?itemName=allannava95.nats-lens"><img src="https://img.shields.io/visual-studio-marketplace/v/allannava95.nats-lens?label=Marketplace&color=0EA5B5" alt="Marketplace"></a>
    <a href="https://github.com/Allan-Nava/nats-lens"><img src="https://img.shields.io/github/license/Allan-Nava/nats-lens?color=2563EB" alt="License"></a>
  </div>
  <div class="cta">
    <a class="btn primary" href="https://marketplace.visualstudio.com/items?itemName=allannava95.nats-lens">Installa da Marketplace</a>
    <a class="btn ghost" href="USAGE.html">Guida all'utilizzo</a>
  </div>
</section>

<h2 class="section-title">Cosa fa</h2>

<div class="features">
  <div class="card">
    <div class="ico">🔌</div>
    <h3>Context CLI, zero config</h3>
    <p>Legge <code>~/.config/nats/context/*.json</code> (url, user/password, token, <code>.creds</code>). Le credenziali servono solo a connettersi e non vengono mai mostrate.</p>
  </div>
  <div class="card">
    <div class="ico">📡</div>
    <h3>Publish / Subscribe / Request</h3>
    <p>Publish con header opzionali, subscribe con wildcard e filtro client-side in un Output dedicato, request-reply con timeout.</p>
  </div>
  <div class="card">
    <div class="ico">🗄️</div>
    <h3>Browser JetStream</h3>
    <p>Stream con messaggi, byte e subjects; consumer con pending e ack-pending. Leggi messaggi per sequenza o ultimo-per-subject; purge stream e delete consumer con doppia conferma.</p>
  </div>
  <div class="card">
    <div class="ico">🔑</div>
    <h3>Key-Value & Object Store</h3>
    <p>Sfoglia i bucket KV (chiavi/valori con revisione) e Object Store (oggetti); leggi, scrivi e carica file.</p>
  </div>
  <div class="card">
    <div class="ico">🟢</div>
    <h3>Stato connessione affidabile</h3>
    <p>La status bar riflette lo stato reale: connesso, <em>reconnecting…</em> se il server cade, off a chiusura definitiva.</p>
  </div>
  <div class="card">
    <div class="ico">🔒</div>
    <h3>Credenziali al sicuro</h3>
    <p>Le label sono sempre oscurate (es. <code>nats://host:4222 (user app)</code>): password e token non finiscono mai nell'UI o nei log.</p>
  </div>
  <div class="card">
    <div class="ico">🪶</div>
    <h3>Leggera</h3>
    <p>Bundle esbuild, unica dipendenza runtime <code>nats</code>. Nessun binario esterno richiesto.</p>
  </div>
</div>

## Installazione rapida

```bash
# da Marketplace: cerca "NATS Lens" (allannava95.nats-lens)
# oppure da .vsix:
code --install-extension nats-lens-<versione>.vsix
```

Poi apri la **activity bar → icona NATS**, scegli un context e connettiti.
Il resto è nella **[guida all'utilizzo](USAGE.html)**; per contribuire vedi **[sviluppo e rilascio](DEVELOPMENT.html)**.
