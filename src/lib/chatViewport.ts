const CHAT_SELECTOR = '.chat-messages';
const CHAT_INPUT_SELECTOR = '.chat-input input';
const FOLLOW_THRESHOLD_PX = 120;

const attachedChats = new WeakSet<HTMLElement>();

function isNearBottom(element: HTMLElement) {
  return element.scrollHeight - element.scrollTop - element.clientHeight <= FOLLOW_THRESHOLD_PX;
}

function scrollChatToBottom(element: HTMLElement, behavior: ScrollBehavior = 'auto') {
  const scroll = () => element.scrollTo({ top: element.scrollHeight, behavior });
  requestAnimationFrame(() => {
    scroll();
    requestAnimationFrame(scroll);
  });
}

function attachChat(element: HTMLElement) {
  if (attachedChats.has(element)) return;
  attachedChats.add(element);

  let followLatest = true;

  element.addEventListener(
    'scroll',
    () => {
      followLatest = isNearBottom(element);
    },
    { passive: true },
  );

  const messageObserver = new MutationObserver(() => {
    if (followLatest) scrollChatToBottom(element);
  });

  messageObserver.observe(element, {
    childList: true,
    subtree: true,
    characterData: true,
  });

  scrollChatToBottom(element);
}

function scanForChats(root: ParentNode = document) {
  if (root instanceof HTMLElement && root.matches(CHAT_SELECTOR)) attachChat(root);
  root.querySelectorAll<HTMLElement>(CHAT_SELECTOR).forEach(attachChat);
}

function syncVisualViewportHeight() {
  const height = window.visualViewport?.height ?? window.innerHeight;
  document.documentElement.style.setProperty('--app-viewport-height', `${Math.round(height)}px`);
}

export function installChatViewportFixes() {
  scanForChats();
  syncVisualViewportHeight();

  const pageObserver = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach(node => {
        if (node instanceof HTMLElement) scanForChats(node);
      });
    }
  });

  pageObserver.observe(document.body, { childList: true, subtree: true });

  document.addEventListener('focusin', event => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || !input.matches(CHAT_INPUT_SELECTOR)) return;

    const chat = input.closest('.assistant-card')?.querySelector<HTMLElement>(CHAT_SELECTOR);
    if (!chat) return;

    scrollChatToBottom(chat);
    window.setTimeout(() => scrollChatToBottom(chat), 250);
  });

  window.addEventListener('resize', syncVisualViewportHeight, { passive: true });
  window.visualViewport?.addEventListener('resize', syncVisualViewportHeight, { passive: true });
  window.visualViewport?.addEventListener('scroll', syncVisualViewportHeight, { passive: true });
}
