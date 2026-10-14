import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import './components.css';
import './workspace-layout.css';
import { applyTheme, watchSystemTheme } from './theme';

applyTheme();
watchSystemTheme();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
