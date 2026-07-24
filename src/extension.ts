import * as vscode from 'vscode';
import { Subscription } from 'nats';
import { loadContexts, redactedLabel, NatsContext } from './core/contexts';
import { NatsClient, StreamSummary } from './core/client';
import { formatMessageLine, isValidSubject, renderPayload, subjectMatches } from './core/payload';
import { parseHeaders } from './core/headers';

type Node =
  | { kind: 'context'; ctx: NatsContext }
  | { kind: 'streams-root' }
  | { kind: 'stream'; stream: StreamSummary }
  | { kind: 'consumer'; label: string; stream?: string; name?: string }
  | { kind: 'subs-root' }
  | { kind: 'subscription'; subject: string };

class ActiveSubs {
  readonly map = new Map<string, { sub: Subscription; channel: vscode.OutputChannel }>();

  stop(subject: string): void {
    const entry = this.map.get(subject);
    if (!entry) return;
    entry.sub.unsubscribe();
    entry.channel.appendLine('--- subscription stopped ---');
    this.map.delete(subject);
  }

  stopAll(): void {
    for (const subject of [...this.map.keys()]) this.stop(subject);
  }
}

class NatsTree implements vscode.TreeDataProvider<Node> {
  private emitter = new vscode.EventEmitter<Node | undefined>();
  readonly onDidChangeTreeData = this.emitter.event;

  constructor(private client: NatsClient, private subs: ActiveSubs) {}

  refresh(): void {
    this.emitter.fire(undefined);
  }

  getTreeItem(node: Node): vscode.TreeItem {
    switch (node.kind) {
      case 'context': {
        const connected =
          this.client.context?.name === node.ctx.name &&
          this.client.connectionState === 'connected';
        const item = new vscode.TreeItem(node.ctx.name, vscode.TreeItemCollapsibleState.None);
        item.description = (connected ? '● connected — ' : node.ctx.selected ? '(cli default) ' : '') + redactedLabel(node.ctx);
        item.iconPath = new vscode.ThemeIcon(connected ? 'vm-active' : 'plug');
        item.contextValue = connected ? 'context-connected' : 'context';
        item.command = connected
          ? undefined
          : { command: 'natsLens.connect', title: 'Connect', arguments: [node.ctx.name] };
        return item;
      }
      case 'streams-root': {
        const item = new vscode.TreeItem('JetStream', vscode.TreeItemCollapsibleState.Expanded);
        item.iconPath = new vscode.ThemeIcon('database');
        return item;
      }
      case 'stream': {
        const s = node.stream;
        const item = new vscode.TreeItem(s.name, vscode.TreeItemCollapsibleState.Collapsed);
        item.description = `${s.messages} msg · ${prettyBytes(s.bytes)} · ${s.subjects.join(', ')}`;
        item.iconPath = new vscode.ThemeIcon('layers');
        item.contextValue = 'stream';
        return item;
      }
      case 'consumer': {
        const item = new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.None);
        item.iconPath = new vscode.ThemeIcon('person');
        if (node.name) item.contextValue = 'consumer';
        return item;
      }
      case 'subs-root': {
        const item = new vscode.TreeItem('Subscriptions', vscode.TreeItemCollapsibleState.Expanded);
        item.iconPath = new vscode.ThemeIcon('broadcast');
        return item;
      }
      case 'subscription': {
        const item = new vscode.TreeItem(node.subject, vscode.TreeItemCollapsibleState.None);
        item.iconPath = new vscode.ThemeIcon('radio-tower');
        item.contextValue = 'subscription';
        return item;
      }
    }
  }

  async getChildren(node?: Node): Promise<Node[]> {
    if (!node) {
      const contexts = loadContexts(
        vscode.workspace.getConfiguration('natsLens').get<string>('contextsDir') || undefined
      );
      const extra = vscode.workspace.getConfiguration('natsLens').get<string[]>('extraServers', []);
      const nodes: Node[] = contexts.map((ctx) => ({ kind: 'context', ctx }));
      for (const url of extra) {
        nodes.push({
          kind: 'context',
          ctx: { name: url, description: '', url, source: '(settings)', selected: false },
        });
      }
      if (this.client.connectionState === 'connected') {
        nodes.push({ kind: 'streams-root' });
        if (this.subs.map.size) nodes.push({ kind: 'subs-root' });
      }
      return nodes;
    }
    if (node.kind === 'streams-root') {
      try {
        const streams = await this.client.streams();
        return streams.map((stream) => ({ kind: 'stream' as const, stream }));
      } catch {
        return [{ kind: 'consumer', label: '(JetStream not available)' }];
      }
    }
    if (node.kind === 'stream') {
      try {
        const consumers = await this.client.consumers(node.stream.name);
        return consumers.map((c) => ({
          kind: 'consumer' as const,
          label: `${c.name} — pending ${c.pending}, ack pending ${c.ackPending}`,
          stream: node.stream.name,
          name: c.name,
        }));
      } catch {
        return [];
      }
    }
    if (node.kind === 'subs-root') {
      return [...this.subs.map.keys()].map((subject) => ({ kind: 'subscription' as const, subject }));
    }
    return [];
  }
}

function prettyBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

export function activate(context: vscode.ExtensionContext): void {
  const client = new NatsClient();
  const subs = new ActiveSubs();
  const tree = new NatsTree(client, subs);

  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 89);
  const updateStatus = () => {
    const name = client.context?.name;
    switch (client.connectionState) {
      case 'connected':
        status.text = `$(broadcast) ${name}`;
        status.tooltip = `NATS Lens — connected to ${name}`;
        break;
      case 'reconnecting':
        status.text = '$(sync~spin) NATS: reconnecting…';
        status.tooltip = `NATS Lens — lost connection to ${name}, reconnecting…`;
        break;
      default:
        status.text = '$(plug) NATS: off';
        status.tooltip = 'NATS Lens — not connected';
    }
    status.command = 'natsLens.connect';
    status.show();
  };
  updateStatus();

  // NL-7: reflect live connection changes (server drop / reconnect) in the UI.
  client.onStatus(() => {
    updateStatus();
    tree.refresh();
  });

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('natsLens.explorer', tree),
    status,

    vscode.commands.registerCommand('natsLens.refresh', () => tree.refresh()),

    vscode.commands.registerCommand('natsLens.connect', async (name?: string) => {
      const contexts = loadContexts(
        vscode.workspace.getConfiguration('natsLens').get<string>('contextsDir') || undefined
      );
      let ctx = contexts.find((c) => c.name === name);
      if (!ctx) {
        const picked = await vscode.window.showQuickPick(
          contexts.map((c) => ({ label: c.name, description: redactedLabel(c), c })),
          { placeHolder: 'NATS context to connect to' }
        );
        ctx = picked?.c;
      }
      if (!ctx) return;
      try {
        await vscode.window.withProgress(
          { location: vscode.ProgressLocation.Window, title: `NATS: connecting to ${ctx.name}…` },
          () => client.connectTo(ctx!)
        );
        const info = client.serverInfo();
        void vscode.window.showInformationMessage(
          `NATS: connected to ${ctx.name}${info ? ` (server ${info.server} v${info.version})` : ''}`
        );
      } catch (err) {
        void vscode.window.showErrorMessage(`NATS: connection to ${ctx.name} failed — ${err}`);
      }
      updateStatus();
      tree.refresh();
    }),

    vscode.commands.registerCommand('natsLens.disconnect', async () => {
      subs.stopAll();
      await client.disconnect();
      updateStatus();
      tree.refresh();
    }),

    vscode.commands.registerCommand('natsLens.publish', async () => {
      const subject = await askSubject('Subject to publish to', false);
      if (!subject) return;
      const payload = await vscode.window.showInputBox({
        prompt: `Payload for ${subject} (plain text or JSON)`,
        value: context.workspaceState.get(`natsLens.payload.${subject}`, ''),
      });
      if (payload === undefined) return;
      void context.workspaceState.update(`natsLens.payload.${subject}`, payload);

      const headerInput = await vscode.window.showInputBox({
        prompt: `Optional headers for ${subject} — one per line as k=v (leave empty for none)`,
        value: context.workspaceState.get(`natsLens.headers.${subject}`, ''),
      });
      if (headerInput === undefined) return;
      void context.workspaceState.update(`natsLens.headers.${subject}`, headerInput);
      const { headers, errors } = parseHeaders(headerInput);
      if (errors.length) {
        void vscode.window.showErrorMessage(`NATS: invalid headers — ${errors.join('; ')}`);
        return;
      }

      try {
        client.publish(subject, payload, headers);
        void vscode.window.setStatusBarMessage(`NATS: published to ${subject}`, 3000);
      } catch (err) {
        void vscode.window.showErrorMessage(`NATS publish failed — ${err}`);
      }
    }),

    vscode.commands.registerCommand('natsLens.request', async () => {
      const subject = await askSubject('Subject to send the request to', false);
      if (!subject) return;
      const payload = await vscode.window.showInputBox({ prompt: `Request payload for ${subject}` });
      if (payload === undefined) return;
      try {
        const reply = await client.request(subject, payload);
        const doc = await vscode.workspace.openTextDocument({ content: reply, language: 'json' });
        await vscode.window.showTextDocument(doc, { preview: true });
      } catch (err) {
        void vscode.window.showErrorMessage(`NATS request failed — ${err}`);
      }
    }),

    vscode.commands.registerCommand('natsLens.subscribe', async () => {
      const subject = await askSubject('Subject to subscribe to (wildcards * and > allowed)', true);
      if (!subject) return;
      if (subs.map.has(subject)) {
        void vscode.window.showWarningMessage(`NATS: already subscribed to ${subject}`);
        return;
      }
      const filter = await vscode.window.showInputBox({
        prompt: `Optional client-side filter (subject pattern, wildcards * and >) — empty shows all`,
      });
      if (filter === undefined) return;
      try {
        const channel = vscode.window.createOutputChannel(`NATS: ${subject}`);
        const sub = client.subscribe(subject, (subj, data, headers) => {
          if (filter && !subjectMatches(filter, subj)) return;
          channel.appendLine(formatMessageLine(subj, data, headers));
        });
        subs.map.set(subject, { sub, channel });
        channel.show(true);
        tree.refresh();
      } catch (err) {
        void vscode.window.showErrorMessage(`NATS subscribe failed — ${err}`);
      }
    }),

    vscode.commands.registerCommand('natsLens.unsubscribe', async (node?: { subject?: string }) => {
      let subject = node?.subject;
      if (!subject) {
        subject = await vscode.window.showQuickPick([...subs.map.keys()], {
          placeHolder: 'Subscription to stop',
        });
      }
      if (subject) {
        subs.stop(subject);
        tree.refresh();
      }
    }),

    vscode.commands.registerCommand('natsLens.purgeStream', async (node?: { stream?: StreamSummary }) => {
      const name = node?.stream?.name;
      if (!name) return;
      if (!(await confirmDestructive(`Purge stream "${name}"? Tutti i messaggi verranno eliminati.`, 'Purge'))) return;
      try {
        const purged = await client.purgeStream(name);
        void vscode.window.showInformationMessage(`NATS: purged ${purged} messages from ${name}`);
        tree.refresh();
      } catch (err) {
        void vscode.window.showErrorMessage(`NATS purge failed — ${err}`);
      }
    }),

    vscode.commands.registerCommand(
      'natsLens.deleteConsumer',
      async (node?: { stream?: string; name?: string }) => {
        const stream = node?.stream;
        const consumer = node?.name;
        if (!stream || !consumer) return;
        if (!(await confirmDestructive(`Delete consumer "${consumer}" from stream "${stream}"?`, 'Delete'))) return;
        try {
          await client.deleteConsumer(stream, consumer);
          void vscode.window.showInformationMessage(`NATS: deleted consumer ${consumer}`);
          tree.refresh();
        } catch (err) {
          void vscode.window.showErrorMessage(`NATS delete consumer failed — ${err}`);
        }
      }
    ),

    vscode.commands.registerCommand('natsLens.readMessage', async (node?: { stream?: StreamSummary }) => {
      const stream = node?.stream?.name;
      if (!stream) return;
      const mode = await vscode.window.showQuickPick(
        [
          { label: 'By sequence', detail: 'Fetch the message with a given stream sequence number', mode: 'seq' as const },
          { label: 'Last by subject', detail: 'Fetch the most recent message on a subject', mode: 'subj' as const },
        ],
        { placeHolder: `Read a message from "${stream}"` }
      );
      if (!mode) return;

      let selector: { seq: number } | { lastBySubject: string };
      if (mode.mode === 'seq') {
        const raw = await vscode.window.showInputBox({
          prompt: `Stream sequence number in "${stream}"`,
          validateInput: (v) => (/^\d+$/.test(v.trim()) && Number(v) > 0 ? undefined : 'positive integer'),
        });
        if (raw === undefined) return;
        selector = { seq: Number(raw.trim()) };
      } else {
        const subject = await askSubject(`Subject in "${stream}" (last message wins)`, true);
        if (!subject) return;
        selector = { lastBySubject: subject };
      }

      try {
        const msg = await client.getStreamMessage(stream, selector);
        const { text, kind } = renderPayload(msg.data);
        const hdr = msg.headers?.map(([k, v]) => `${k}=${v.join(',')}`).join(' ') ?? '';
        const header = `// ${stream} · seq ${msg.seq} · ${msg.subject} · ${msg.time}${hdr ? ` · {${hdr}}` : ''}\n\n`;
        const doc = await vscode.workspace.openTextDocument({
          content: header + text,
          language: kind === 'json' ? 'json' : 'plaintext',
        });
        await vscode.window.showTextDocument(doc, { preview: true });
      } catch (err) {
        void vscode.window.showErrorMessage(`NATS: no message found — ${err}`);
      }
    }),

    vscode.commands.registerCommand('natsLens.addConsumer', async (node?: { stream?: StreamSummary }) => {
      const stream = node?.stream?.name;
      if (!stream) return;
      const durableName = await vscode.window.showInputBox({
        prompt: `Durable consumer name on "${stream}"`,
        validateInput: (v) => (/^[A-Za-z0-9_-]+$/.test(v.trim()) ? undefined : 'use letters, digits, _ or -'),
      });
      if (!durableName) return;
      const ack = await vscode.window.showQuickPick(['explicit', 'all', 'none'], { placeHolder: 'Ack policy' });
      if (!ack) return;
      const deliver = await vscode.window.showQuickPick(['all', 'new', 'last'], { placeHolder: 'Deliver policy' });
      if (!deliver) return;
      const filter = await vscode.window.showInputBox({
        prompt: 'Optional filter subject (wildcards allowed, empty = none)',
        validateInput: (v) => (!v.trim() || isValidSubject(v.trim(), true) ? undefined : 'invalid NATS subject'),
      });
      if (filter === undefined) return;
      try {
        await client.addConsumer(stream, {
          durableName: durableName.trim(),
          ackPolicy: ack as 'explicit' | 'all' | 'none',
          deliverPolicy: deliver as 'all' | 'new' | 'last',
          filterSubject: filter.trim() || undefined,
        });
        void vscode.window.showInformationMessage(`NATS: created consumer ${durableName.trim()} on ${stream}`);
        tree.refresh();
      } catch (err) {
        void vscode.window.showErrorMessage(`NATS create consumer failed — ${err}`);
      }
    })
  );

  context.subscriptions.push({
    dispose: () => {
      subs.stopAll();
      void client.disconnect();
    },
  });
}

/** Two-step modal confirmation for destructive JetStream ops (NL-9). Never defaults to yes. */
async function confirmDestructive(message: string, confirmLabel: string): Promise<boolean> {
  const first = await vscode.window.showWarningMessage(message, { modal: true }, confirmLabel);
  if (first !== confirmLabel) return false;
  const second = await vscode.window.showWarningMessage(
    "Operazione NON reversibile. Confermi?",
    { modal: true },
    confirmLabel
  );
  return second === confirmLabel;
}

async function askSubject(prompt: string, wildcards: boolean): Promise<string | undefined> {
  return vscode.window.showInputBox({
    prompt,
    validateInput: (v) => (isValidSubject(v.trim(), wildcards) ? undefined : 'invalid NATS subject'),
  }).then((v) => v?.trim());
}

export function deactivate(): void {}
