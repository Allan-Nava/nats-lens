import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import type { DashboardModel, InboundMessage, OutboundMessage } from '../core/dashboard';

interface VsCodeApi {
  postMessage(msg: InboundMessage): void;
}
declare function acquireVsCodeApi(): VsCodeApi;

const vscode = acquireVsCodeApi();

function Root() {
  const [model, setModel] = React.useState<DashboardModel | null>(null);

  React.useEffect(() => {
    const onMessage = (e: MessageEvent<OutboundMessage>) => {
      if (e.data?.type === 'model') setModel(e.data.model);
    };
    window.addEventListener('message', onMessage);
    vscode.postMessage({ type: 'ready' });
    return () => window.removeEventListener('message', onMessage);
  }, []);

  return <App model={model} onRefresh={() => vscode.postMessage({ type: 'refresh' })} />;
}

createRoot(document.getElementById('root')!).render(<Root />);
