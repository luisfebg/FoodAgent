import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { installChatViewportFixes } from './lib/chatViewport';
import { installInteractiveChat } from './lib/interactiveChat';
import './index.css';
import './mobile-fixes.css';
import './chat-interactions.css';

installChatViewportFixes();
installInteractiveChat();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
