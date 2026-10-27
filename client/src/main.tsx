import React from 'react';
import ReactDOM from 'react-dom/client';
// Fuente display autoalojada (Shippori Mincho) — sin llamada a Google Fonts.
import '@fontsource/shippori-mincho/500.css';
import '@fontsource/shippori-mincho/600.css';
import '@fontsource/shippori-mincho/700.css';
import './styles/tokens.css';
import './styles/global.css';
import { App } from './App';
import { registerServiceWorker } from './pwa';
import { initInstallPrompt } from './lib/install';

// ANTES de montar React: `beforeinstallprompt` se dispara solo, muy pronto, y si
// nadie lo ha capturado cuando llega, se pierde para toda la sesión.
initInstallPrompt();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

registerServiceWorker();
