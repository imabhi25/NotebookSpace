import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import '@fontsource-variable/geist/wght.css';
import '@fontsource-variable/newsreader/wght.css';
import 'katex/dist/katex.min.css';
import './index.css';
import './components.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
