import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { shouldUseMockApi } from './lib/platform';
import './styles.css';

async function bootstrap() {
  if (shouldUseMockApi) {
    const { installMockApi } = await import('./lib/mock-api');
    installMockApi();
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
