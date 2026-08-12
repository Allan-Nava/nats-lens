import * as vscode from 'vscode';
import { Subscription } from 'nats';
import { loadContexts, redactedLabel, NatsContext } from './core/contexts';
import { NatsClient, StreamSummary, ConsumerSummary } from './core/client';
import { streamTooltip, consumerTooltip, matchesFilter, sortStreams, StreamSort } from './core/tree';
import {
  formatMessageLine,
  isValidSubject,
  renderPayload,
  subjectMatches,
  previewPayload,
  formatStoredMessage,
  toBase64,
  toHex,
} from './core/payload';
import { parseHeaders } from './core/headers';
import { serializeSubscriptions, parseSubscriptions } from './core/subscriptions';
import { validateJson, JsonSchema } from './core/schema';
import { buildDashboardModel, InboundMessage, OutboundMessage, StreamRow } from './core/dashboard';

type Node =
  | { kind: 'context'; ctx: NatsContext }
  | { kind: 'streams-root' }
  | { kind: 'stream'; stream: StreamSummary }
  | { kind: 'consumer'; label: string; stream?: string; name?: string; summary?: ConsumerSummary }
  | { kind: 'subs-root' }
  | { kind: 'subscription'; subject: string }
  | { kind: 'kv-root' }
  | { kind: 'kv-bucket'; bucket: string; values: number; bytes: number }
  | { kind: 'kv-key'; bucket: string; key: string }
  | { kind: 'os-root' }
  | { kind: 'os-bucket'; bucket: string; bytes: number }
  | { kind: 'os-object'; bucket: string; name: string; size: number };

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

  /** NL-31: client-side name filter applied to top-level named nodes. */
  filter = '';

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
        item.id = `stream:${s.name}`;
        item.tooltip = new vscode.MarkdownString(streamTooltip(s));
        return item;
      }
      case 'consumer': {
        const item = new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.None);
        item.iconPath = new vscode.ThemeIcon('person');
        if (node.name) item.contextValue = 'consumer';
        if (node.summary) item.tooltip = new vscode.MarkdownString(consumerTooltip(node.summary));
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
      case 'kv-root': {
        const item = new vscode.TreeItem('Key-Value', vscode.TreeItemCollapsibleState.Collapsed);
        item.iconPath = new vscode.ThemeIcon('symbol-key');
        return item;
      }
      case 'kv-bucket': {
        const item = new vscode.TreeItem(node.bucket, vscode.TreeItemCollapsibleState.Collapsed);
        item.description = `${node.values} values · ${prettyBytes(node.bytes)}`;
        item.iconPath = new vscode.ThemeIcon('archive');
        item.contextValue = 'kv-bucket';
        return item;
      }
      case 'kv-key': {
        const item = new vscode.TreeItem(node.key, vscode.TreeItemCollapsibleState.None);
        item.iconPath = new vscode.ThemeIcon('symbol-string');
        item.contextValue = 'kv-key';
        item.command = { command: 'natsLens.kvGet', title: 'Open value', arguments: [node] };
        return item;
      }
      case 'os-root': {
        const item = new vscode.TreeItem('Object Store', vscode.TreeItemCollapsibleState.Collapsed);
        item.iconPath = new vscode.ThemeIcon('file-binary');
        return item;
      }
      case 'os-bucket': {
        const item = new vscode.TreeItem(node.bucket, vscode.TreeItemCollapsibleState.Collapsed);
        item.description = prettyBytes(node.bytes);
        item.iconPath = new vscode.ThemeIcon('archive');
        item.contextValue = 'os-bucket';
        return item;
      }
      case 'os-object': {
        const item = new vscode.TreeItem(node.name, vscode.TreeItemCollapsibleState.None);
        item.description = prettyBytes(node.size);
        item.iconPath = new vscode.ThemeIcon('file');
        item.contextValue = 'os-object';
        item.command = { command: 'natsLens.osGet', title: 'Open object', arguments: [node] };
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
      const nodes: Node[] = contexts
        .filter((ctx) => matchesFilter(ctx.name, this.filter))
        .map((ctx) => ({ kind: 'context', ctx }));
      for (const url of extra) {
        nodes.push({
          kind: 'context',
          ctx: { name: url, description: '', url, source: '(settings)', selected: false },
        });
      }
      if (this.client.connectionState === 'connected') {
        nodes.push({ kind: 'streams-root' });
        nodes.push({ kind: 'kv-root' });
        nodes.push({ kind: 'os-root' });
        if (this.subs.map.size) nodes.push({ kind: 'subs-root' });
      }
      return nodes;
    }
    if (node.kind === 'streams-root') {
      try {
        const streams = await this.client.streams();
        const sortBy = vscode.workspace
          .getConfiguration('natsLens')
          .get<StreamSort>('streamSort', 'name');
        return sortStreams(streams, sortBy)
          .filter((stream) => matchesFilter(stream.name, this.filter))
          .map((stream) => ({ kind: 'stream' as const, stream }));
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
          summary: c,
        }));
      } catch {
        return [];
      }
    }
    if (node.kind === 'subs-root') {
      return [...this.subs.map.keys()].map((subject) => ({ kind: 'subscription' as const, subject }));
    }
    if (node.kind === 'kv-root') {
      try {
        const buckets = await this.client.kvBuckets();
        return buckets
          .filter((b) => matchesFilter(b.bucket, this.filter))
          .map((b) => ({ kind: 'kv-bucket' as const, bucket: b.bucket, values: b.values, bytes: b.bytes }));
      } catch {
        return [];
      }
    }
    if (node.kind === 'kv-bucket') {
      try {
        const keys = await this.client.kvKeys(node.bucket);
        return keys.map((key) => ({ kind: 'kv-key' as const, bucket: node.bucket, key }));
      } catch {
        return [];
      }
    }
    if (node.kind === 'os-root') {
      try {
        const buckets = await this.client.osBuckets();
        return buckets
          .filter((b) => matchesFilter(b.bucket, this.filter))
          .map((b) => ({ kind: 'os-bucket' as const, bucket: b.bucket, bytes: b.bytes }));
      } catch {
        return [];
      }
    }
    if (node.kind === 'os-bucket') {
      try {
        const objects = await this.client.osList(node.bucket);
        return objects.map((o) => ({ kind: 'os-object' as const, bucket: node.bucket, name: o.name, size: o.size }));
      } catch {
        return [];
      }
    }
    return [];
  }
}

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (let i = 0; i < 32; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function dashboardHtml(webview: vscode.Webview, extUri: vscode.Uri): string {
  const nonce = getNonce();
  const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extUri, 'dist', 'webview.js'));
  const cssUri = webview.asWebviewUri(vscode.Uri.joinPath(extUri, 'dist', 'webview.css'));
  const csp = [
    `default-src 'none'`,
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `script-src 'nonce-${nonce}'`,
    `font-src ${webview.cspSource}`,
  ].join('; ');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link href="${cssUri}" rel="stylesheet">
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
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
    status.command = 'natsLens.quickActions';
    status.show();
  };
  updateStatus();

  // NL-7: reflect live connection changes (server drop / reconnect) in the UI.
  client.onStatus(() => {
    updateStatus();
    tree.refresh();
    void postModel();
  });

  // NL-8/NL-18: subscription helpers shared by the subscribe command, session
  // restore, and import.
  const SUBS_KEY = 'natsLens.subs';
  const persistSubs = () => void context.workspaceState.update(SUBS_KEY, [...subs.map.keys()]);
  const subscribeTo = (subject: string, filter?: string): boolean => {
    if (subs.map.has(subject)) return false;
    const channel = vscode.window.createOutputChannel(`NATS: ${subject}`);
    const sub = client.subscribe(subject, (subj, data, headers) => {
      if (filter && !subjectMatches(filter, subj)) return;
      channel.appendLine(formatMessageLine(subj, data, headers));
    });
    subs.map.set(subject, { sub, channel });
    return true;
  };

  // NL-24: webview dashboard — single panel + typed message bridge.
  let dashboardPanel: vscode.WebviewPanel | undefined;
  const dashboardSubs = new Map<string, Subscription>(); // NL-26: live subs owned by the dashboard
  const postModel = async () => {
    if (!dashboardPanel) return;
    let streams: StreamRow[] = [];
    let kvBuckets: string[] = [];
    let osBuckets: string[] = [];
    if (client.connectionState === 'connected') {
      try {
        streams = (await client.streams()).map((s) => ({ name: s.name, messages: s.messages }));
      } catch {
        /* ignore */
      }
      try {
        kvBuckets = (await client.kvBuckets()).map((b) => b.bucket);
      } catch {
        /* ignore */
      }
      try {
        osBuckets = (await client.osBuckets()).map((b) => b.bucket);
      } catch {
        /* ignore */
      }
    }
    const model = buildDashboardModel({
      connectionState: client.connectionState,
      context: client.context?.name ?? null,
      streams,
      kvBuckets,
      osBuckets,
      subscriptions: subs.map.size,
    });
    void dashboardPanel.webview.postMessage({ type: 'model', model } satisfies OutboundMessage);
  };

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('natsLens.explorer', tree),
    status,

    vscode.commands.registerCommand('natsLens.refresh', () => tree.refresh()),

    vscode.commands.registerCommand('natsLens.filter', async () => {
      const value = await vscode.window.showInputBox({
        prompt: 'Filter tree by name (empty = clear)',
        value: tree.filter,
      });
      if (value === undefined) return;
      tree.filter = value.trim();
      tree.refresh();
    }),

    vscode.commands.registerCommand('natsLens.toggleStreamSort', async () => {
      const cfg = vscode.workspace.getConfiguration('natsLens');
      const next: StreamSort = cfg.get<StreamSort>('streamSort', 'name') === 'name' ? 'messages' : 'name';
      await cfg.update('streamSort', next, vscode.ConfigurationTarget.Global);
      void vscode.window.setStatusBarMessage(`NATS: streams sorted by ${next}`, 2000);
      tree.refresh();
    }),

    vscode.commands.registerCommand('natsLens.quickActions', async () => {
      const connected = client.connectionState === 'connected';
      const items: Array<vscode.QuickPickItem & { cmd: string }> = [
        { label: '$(dashboard) Open Dashboard', cmd: 'natsLens.openDashboard' },
        connected
          ? { label: '$(debug-disconnect) Disconnect', cmd: 'natsLens.disconnect' }
          : { label: '$(plug) Connect to Context', cmd: 'natsLens.connect' },
        { label: '$(key) Connect with Token…', cmd: 'natsLens.connectWithToken' },
        { label: '$(arrow-up) Publish', cmd: 'natsLens.publish' },
        { label: '$(radio-tower) Subscribe', cmd: 'natsLens.subscribe' },
        { label: '$(filter) Filter tree…', cmd: 'natsLens.filter' },
      ];
      const picked = await vscode.window.showQuickPick(items, { placeHolder: 'NATS Lens — quick actions' });
      if (picked) void vscode.commands.executeCommand(picked.cmd);
    }),

    vscode.commands.registerCommand('natsLens.openDashboard', () => {
      if (dashboardPanel) {
        dashboardPanel.reveal();
        return;
      }
      dashboardPanel = vscode.window.createWebviewPanel(
        'natsLensDashboard',
        'NATS Lens',
        vscode.ViewColumn.Active,
        {
          enableScripts: true,
          retainContextWhenHidden: true,
          localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'dist')],
        }
      );
      dashboardPanel.webview.html = dashboardHtml(dashboardPanel.webview, context.extensionUri);
      dashboardPanel.onDidDispose(() => {
        for (const sub of dashboardSubs.values()) sub.unsubscribe();
        dashboardSubs.clear();
        dashboardPanel = undefined;
      });
      dashboardPanel.webview.onDidReceiveMessage(async (msg: InboundMessage) => {
        const post = (m: OutboundMessage) => void dashboardPanel?.webview.postMessage(m);
        try {
          switch (msg.type) {
            case 'ready':
            case 'refresh':
              await postModel();
              post({ type: 'subscriptions', subjects: [...dashboardSubs.keys()] });
              break;
            case 'publish': {
              const { headers, errors } = parseHeaders(msg.headers ?? '');
              if (errors.length) {
                post({ type: 'error', message: `invalid headers — ${errors.join('; ')}` });
                break;
              }
              client.publish(msg.subject, msg.payload, headers);
              post({ type: 'reply', ok: true, text: `published to ${msg.subject}` });
              break;
            }
            case 'request': {
              const reply = await client.request(msg.subject, msg.payload);
              post({ type: 'reply', ok: true, text: reply });
              break;
            }
            case 'subscribe': {
              if (dashboardSubs.has(msg.subject)) break;
              const sub = client.subscribe(msg.subject, (subj, data) => {
                if (msg.filter && !subjectMatches(msg.filter, subj)) return;
                const { text } = previewPayload(data, 2000);
                post({ type: 'message', message: { subject: subj, ts: new Date().toISOString(), body: text } });
              });
              dashboardSubs.set(msg.subject, sub);
              post({ type: 'subscriptions', subjects: [...dashboardSubs.keys()] });
              break;
            }
            case 'unsubscribe': {
              dashboardSubs.get(msg.subject)?.unsubscribe();
              dashboardSubs.delete(msg.subject);
              post({ type: 'subscriptions', subjects: [...dashboardSubs.keys()] });
              break;
            }
            case 'readMessage': {
              const selector =
                msg.seq !== undefined ? { seq: msg.seq } : { lastBySubject: msg.lastBySubject ?? '' };
              const stored = await client.getStreamMessage(msg.stream, selector);
              post({ type: 'messageDoc', ...formatStoredMessage(stored) });
              break;
            }
          }
        } catch (err) {
          post({ type: 'error', message: String(err) });
        }
      });
    }),

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
        // NL-8: restore subscriptions persisted from a previous session.
        const saved = context.workspaceState.get<string[]>(SUBS_KEY, []);
        let restored = 0;
        for (const s of saved) {
          try {
            if (subscribeTo(s)) restored++;
          } catch {
            /* skip subjects that no longer subscribe cleanly */
          }
        }
        if (restored) void vscode.window.setStatusBarMessage(`NATS: restored ${restored} subscription(s)`, 3000);
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
        subscribeTo(subject, filter || undefined);
        subs.map.get(subject)?.channel.show(true);
        persistSubs();
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
        persistSubs();
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

    vscode.commands.registerCommand(
      'natsLens.updateConsumer',
      async (node?: { stream?: string; name?: string }) => {
        const stream = node?.stream;
        const consumer = node?.name;
        if (!stream || !consumer) return;
        const maxRaw = await vscode.window.showInputBox({
          prompt: `max deliver for "${consumer}" (-1 = unlimited)`,
          validateInput: (v) => (/^-?\d+$/.test(v.trim()) ? undefined : 'integer'),
        });
        if (maxRaw === undefined) return;
        const ackRaw = await vscode.window.showInputBox({
          prompt: `ack wait (ms) for "${consumer}"`,
          validateInput: (v) => (/^\d+$/.test(v.trim()) && Number(v) > 0 ? undefined : 'positive integer'),
        });
        if (ackRaw === undefined) return;
        try {
          const r = await client.updateConsumer(stream, consumer, {
            maxDeliver: Number(maxRaw.trim()),
            ackWaitMs: Number(ackRaw.trim()),
          });
          void vscode.window.showInformationMessage(
            `NATS: updated ${consumer} — max deliver ${r.maxDeliver}, ack wait ${r.ackWaitMs}ms`
          );
          tree.refresh();
        } catch (err) {
          void vscode.window.showErrorMessage(`NATS update consumer failed — ${err}`);
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
    }),

    vscode.commands.registerCommand('natsLens.kvGet', async (node?: { bucket?: string; key?: string }) => {
      const bucket = node?.bucket;
      const key = node?.key;
      if (!bucket || !key) return;
      try {
        const entry = await client.kvGet(bucket, key);
        if (!entry) {
          void vscode.window.showWarningMessage(`NATS KV: ${bucket}/${key} not found`);
          return;
        }
        const { text, kind } = renderPayload(new TextEncoder().encode(entry.value));
        const header = `// KV ${bucket}/${key} · rev ${entry.revision}\n\n`;
        const doc = await vscode.workspace.openTextDocument({
          content: header + text,
          language: kind === 'json' ? 'json' : 'plaintext',
        });
        await vscode.window.showTextDocument(doc, { preview: true });
      } catch (err) {
        void vscode.window.showErrorMessage(`NATS KV get failed — ${err}`);
      }
    }),

    vscode.commands.registerCommand('natsLens.kvSet', async (node?: { bucket?: string }) => {
      const bucket =
        node?.bucket ??
        (await vscode.window.showInputBox({
          prompt: 'KV bucket (esistente o nuovo)',
          validateInput: (v) => (/^[A-Za-z0-9_-]+$/.test(v.trim()) ? undefined : 'use letters, digits, _ or -'),
        }));
      if (!bucket) return;
      const key = await vscode.window.showInputBox({
        prompt: `Key in "${bucket}"`,
        validateInput: (v) => (v.trim().length ? undefined : 'key required'),
      });
      if (!key) return;
      const value = await vscode.window.showInputBox({ prompt: `Value for ${bucket}/${key.trim()}` });
      if (value === undefined) return;
      try {
        const rev = await client.kvPut(bucket, key.trim(), value);
        void vscode.window.showInformationMessage(`NATS KV: set ${bucket}/${key.trim()} (rev ${rev})`);
        tree.refresh();
      } catch (err) {
        void vscode.window.showErrorMessage(`NATS KV set failed — ${err}`);
      }
    }),

    vscode.commands.registerCommand('natsLens.exportSubs', async () => {
      const subjects = [...subs.map.keys()];
      if (!subjects.length) {
        void vscode.window.showWarningMessage('NATS: no active subscriptions to export');
        return;
      }
      const uri = await vscode.window.showSaveDialog({
        filters: { JSON: ['json'] },
        saveLabel: 'Export subscriptions',
      });
      if (!uri) return;
      await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(serializeSubscriptions(subjects)));
      void vscode.window.showInformationMessage(`NATS: exported ${subjects.length} subscription(s)`);
    }),

    vscode.commands.registerCommand('natsLens.importSubs', async () => {
      if (client.connectionState !== 'connected') {
        void vscode.window.showWarningMessage('NATS: connect to a context first');
        return;
      }
      const picked = await vscode.window.showOpenDialog({
        canSelectMany: false,
        filters: { JSON: ['json'] },
        openLabel: 'Import subscriptions',
      });
      if (!picked?.[0]) return;
      const bytes = await vscode.workspace.fs.readFile(picked[0]);
      const { subjects, errors } = parseSubscriptions(new TextDecoder().decode(bytes));
      let added = 0;
      for (const s of subjects) {
        try {
          if (subscribeTo(s)) added++;
        } catch {
          /* skip */
        }
      }
      persistSubs();
      tree.refresh();
      void vscode.window.showInformationMessage(
        `NATS: imported ${added} subscription(s)${errors.length ? `, ${errors.length} skipped` : ''}`
      );
    }),

    vscode.commands.registerCommand('natsLens.validateJson', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        void vscode.window.showWarningMessage('NATS: open the JSON document to validate first');
        return;
      }
      let value: unknown;
      try {
        value = JSON.parse(editor.document.getText());
      } catch {
        void vscode.window.showErrorMessage('NATS: the active document is not valid JSON');
        return;
      }
      const picked = await vscode.window.showOpenDialog({
        canSelectMany: false,
        filters: { JSON: ['json'] },
        openLabel: 'Pick JSON Schema',
      });
      if (!picked?.[0]) return;
      let schema: JsonSchema;
      try {
        schema = JSON.parse(new TextDecoder().decode(await vscode.workspace.fs.readFile(picked[0]))) as JsonSchema;
      } catch {
        void vscode.window.showErrorMessage('NATS: the schema file is not valid JSON');
        return;
      }
      const errors = validateJson(value, schema);
      if (!errors.length) {
        void vscode.window.showInformationMessage('NATS: ✓ payload is valid against the schema');
        return;
      }
      const channel = vscode.window.createOutputChannel('NATS: schema validation');
      channel.clear();
      channel.appendLine(`${errors.length} validation error(s):`);
      for (const e of errors) channel.appendLine(`  ${e.path}: ${e.message}`);
      channel.show(true);
      void vscode.window.showErrorMessage(`NATS: ${errors.length} schema validation error(s) — see output`);
    }),

    // NL-11: monitor server system events. Requires a context with system-account
    // privileges; without them the subject simply yields nothing.
    vscode.commands.registerCommand('natsLens.monitorSys', async () => {
      if (client.connectionState !== 'connected') {
        void vscode.window.showWarningMessage('NATS: connect to a context first');
        return;
      }
      const subject = '$SYS.>';
      if (subs.map.has(subject)) {
        subs.map.get(subject)?.channel.show(true);
        return;
      }
      try {
        subscribeTo(subject);
        subs.map.get(subject)?.channel.show(true);
        tree.refresh();
        void vscode.window.showInformationMessage(
          'NATS: monitoring $SYS.> (requires system-account privileges)'
        );
      } catch (err) {
        void vscode.window.showErrorMessage(`NATS: cannot monitor $SYS — ${err}`);
      }
    }),

    // NL-19: connect to an ad-hoc server with a token entered at runtime. The
    // token is masked on input, kept only in the in-memory context, and never
    // persisted or logged (same guarantee as CLI-context credentials).
    vscode.commands.registerCommand('natsLens.connectWithToken', async () => {
      const url = await vscode.window.showInputBox({
        prompt: 'Server URL',
        value: 'nats://localhost:4222',
        validateInput: (v) => (/^nats:\/\/.+/.test(v.trim()) ? undefined : 'use nats://host:port'),
      });
      if (!url) return;
      const token = await vscode.window.showInputBox({
        prompt: 'Token (masked — kept only in memory, never stored)',
        password: true,
      });
      if (token === undefined) return;
      const ctx: NatsContext = {
        name: url.trim(),
        description: '',
        url: url.trim(),
        token: token.trim() || undefined,
        source: '(token)',
        selected: false,
      };
      try {
        await vscode.window.withProgress(
          { location: vscode.ProgressLocation.Window, title: `NATS: connecting to ${ctx.name}…` },
          () => client.connectTo(ctx)
        );
        void vscode.window.showInformationMessage(`NATS: connected to ${ctx.name}`);
      } catch (err) {
        void vscode.window.showErrorMessage(`NATS: connection to ${ctx.name} failed — ${err}`);
      }
      updateStatus();
      tree.refresh();
    }),

    vscode.commands.registerCommand('natsLens.osGet', async (node?: { bucket?: string; name?: string }) => {
      const bucket = node?.bucket;
      const name = node?.name;
      if (!bucket || !name) return;
      try {
        const data = await client.osGet(bucket, name);
        if (!data) {
          void vscode.window.showWarningMessage(`NATS OS: ${bucket}/${name} not found`);
          return;
        }
        const { text, kind } = renderPayload(data);
        const doc = await vscode.workspace.openTextDocument({
          content: `// OS ${bucket}/${name} · ${data.byteLength} bytes\n\n${text}`,
          language: kind === 'json' ? 'json' : 'plaintext',
        });
        await vscode.window.showTextDocument(doc, { preview: true });
      } catch (err) {
        void vscode.window.showErrorMessage(`NATS OS get failed — ${err}`);
      }
    }),

    vscode.commands.registerCommand('natsLens.osPut', async (node?: { bucket?: string }) => {
      const bucket = node?.bucket;
      if (!bucket) return;
      const picked = await vscode.window.showOpenDialog({ canSelectMany: false, openLabel: 'Upload to Object Store' });
      if (!picked?.[0]) return;
      try {
        const data = await vscode.workspace.fs.readFile(picked[0]);
        const name = picked[0].path.split('/').pop() || 'object';
        const info = await client.osPut(bucket, name, data);
        void vscode.window.showInformationMessage(`NATS OS: stored ${bucket}/${info.name} (${info.size} bytes)`);
        tree.refresh();
      } catch (err) {
        void vscode.window.showErrorMessage(`NATS OS put failed — ${err}`);
      }
    }),

    vscode.commands.registerCommand('natsLens.osDownload', async (node?: { bucket?: string; name?: string }) => {
      const bucket = node?.bucket;
      const name = node?.name;
      if (!bucket || !name) return;
      try {
        const data = await client.osGet(bucket, name);
        if (!data) {
          void vscode.window.showWarningMessage(`NATS OS: ${bucket}/${name} not found`);
          return;
        }
        const uri = await vscode.window.showSaveDialog({ saveLabel: 'Download object', defaultUri: vscode.Uri.file(name) });
        if (!uri) return;
        await vscode.workspace.fs.writeFile(uri, data);
        void vscode.window.showInformationMessage(`NATS OS: downloaded ${name}`);
      } catch (err) {
        void vscode.window.showErrorMessage(`NATS OS download failed — ${err}`);
      }
    }),

    vscode.commands.registerCommand('natsLens.kvDownload', async (node?: { bucket?: string; key?: string }) => {
      const bucket = node?.bucket;
      const key = node?.key;
      if (!bucket || !key) return;
      try {
        const entry = await client.kvGet(bucket, key);
        if (!entry) {
          void vscode.window.showWarningMessage(`NATS KV: ${bucket}/${key} not found`);
          return;
        }
        const uri = await vscode.window.showSaveDialog({ saveLabel: 'Download value', defaultUri: vscode.Uri.file(key) });
        if (!uri) return;
        await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(entry.value));
        void vscode.window.showInformationMessage(`NATS KV: downloaded ${bucket}/${key}`);
      } catch (err) {
        void vscode.window.showErrorMessage(`NATS KV download failed — ${err}`);
      }
    }),

    // NL-21: inspect the active document's bytes as base64 or hex.
    vscode.commands.registerCommand('natsLens.inspectPayload', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        void vscode.window.showWarningMessage('NATS: open a document to inspect first');
        return;
      }
      const enc = await vscode.window.showQuickPick(['base64', 'hex'], { placeHolder: 'Encode active document as…' });
      if (!enc) return;
      const bytes = new TextEncoder().encode(editor.document.getText());
      const out = enc === 'base64' ? toBase64(bytes) : toHex(bytes);
      const doc = await vscode.workspace.openTextDocument({ content: out, language: 'plaintext' });
      await vscode.window.showTextDocument(doc, { preview: true });
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
