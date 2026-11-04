import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import './overrides.css';
import './kana.css';
import './layout.css';
import './kana-overrides.css';

// 開発中はService Workerのキャッシュで古い画面が残らないよう登録しない。
if (import.meta.env.PROD && 'serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js'));
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
