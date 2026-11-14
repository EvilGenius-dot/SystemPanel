import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';
import { isTauri } from '@tauri-apps/api/core';

const desktop = isTauri();
document.documentElement.dataset.runtime = desktop ? 'desktop' : 'browser';
if (desktop && navigator.userAgent.includes('Windows')) {
  document.documentElement.dataset.platform = 'windows';
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><App /></React.StrictMode>,
);
