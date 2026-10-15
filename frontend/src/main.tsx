import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import '@fontsource-variable/geist/wght.css';
import './index.css';
import './components.css';
import './shell.css';
import { applyTheme, watchSystemTheme } from './theme';

applyTheme();
watchSystemTheme();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
