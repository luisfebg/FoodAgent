import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { installChatViewportFixes } from './lib/chatViewport';
import './index.css';
import './mobile-fixes.css';

installChatViewportFixes();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
