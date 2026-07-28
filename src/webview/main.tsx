import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import type { DashboardModel, InboundMessage, LiveMessage, OutboundMessage } from '../core/dashboard';

interface VsCodeApi {
  postMessage(msg: InboundMessage): void;
}
declare function acquireVsCodeApi(): VsCodeApi;

const vscode = acquireVsCodeApi();
const MAX_MESSAGES = 500;

function Root() {
  const [model, setModel] = React.useState<DashboardModel | null>(null);
  const [reply, setReply] = React.useState<string | null>(null);
  const [messages, setMessages] = React.useState<LiveMessage[]>([]);
  const [subscriptions, setSubscriptions] = React.useState<string[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const onMessage = (e: MessageEvent<OutboundMessage>) => {
      const msg = e.data;
      switch (msg?.type) {
        case 'model':
          setModel(msg.model);
          break;
        case 'subscriptions':
          setSubscriptions(msg.subjects);
          break;
        case 'message':
          setMessages((prev) => [msg.message, ...prev].slice(0, MAX_MESSAGES));
          break;
        case 'reply':
          setReply(msg.text);
          setError(null);
          break;
        case 'error':
          setError(msg.message);
          break;
      }
    };
    window.addEventListener('message', onMessage);
    vscode.postMessage({ type: 'ready' });
    return () => window.removeEventListener('message', onMessage);
  }, []);

  return (
    <App
      model={model}
      send={(m) => vscode.postMessage(m)}
      reply={reply}
      messages={messages}
      subscriptions={subscriptions}
      error={error}
    />
  );
}

createRoot(document.getElementById('root')!).render(<Root />);
