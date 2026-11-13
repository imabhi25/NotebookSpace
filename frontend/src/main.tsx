import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import '@fontsource-variable/inter';
import './index.css';
import './components.css';
import './workspace-layout.css';
import { applyTheme } from './theme';
import { applyReadingFont } from './readingFont';

applyTheme();
applyReadingFont();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
