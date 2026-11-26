import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { isTauri, shouldUseMockApi } from './lib/platform';
import { blockNativeContextMenu } from './lib/native-context-menu';
import { countLaunch } from './features/feedback/star';
import '@fontsource-variable/inter';
import './styles/app.css';
import './lib/diff-palette';
import './lib/typography';

async function bootstrap() {
  if (shouldUseMockApi) {
    const { installMockApi } = await import('./lib/mock-api');
    installMockApi();
  }
  if (isTauri) {
    blockNativeContextMenu();
  }
  if (!isTauri || (await import('@tauri-apps/api/window')).getCurrentWindow().label === 'main') {
    countLaunch();
  }
  if (import.meta.env.DEV && isTauri && !shouldUseMockApi) {
    const dev = await import('./lib/dev');
    dev.installConsoleForwarding();
    await dev.applyDevLaunchTarget();
  }
  const root = document.getElementById('root');
  if (!root) {
    throw new Error('root element missing');
  }
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void bootstrap();
