const CHAT_SELECTOR = '.chat-messages';
const CHAT_INPUT_SELECTOR = '.chat-input input';
const FOLLOW_THRESHOLD_PX = 120;
const MOBILE_CHAT_QUERY = '(max-width: 580px)';
const FORCE_FOLLOW_MS = 12000;

const attachedChats = new WeakSet<HTMLElement>();
const forceFollowUntil = new WeakMap<HTMLElement, number>();
let chatFocusScrollY = 0;

function isNearBottom(element: HTMLElement) {
  return element.scrollHeight - element.scrollTop - element.clientHeight <= FOLLOW_THRESHOLD_PX;
}

function shouldForceFollow(element: HTMLElement) {
  return (forceFollowUntil.get(element) || 0) > Date.now();
}

function scrollChatToBottom(element: HTMLElement, behavior: ScrollBehavior = 'auto') {
  const scroll = () => element.scrollTo({ top: element.scrollHeight, behavior });
  requestAnimationFrame(() => {
    scroll();
    requestAnimationFrame(scroll);
  });
}

function forceChatToLatest(element: HTMLElement) {
  forceFollowUntil.set(element, Date.now() + FORCE_FOLLOW_MS);
  scrollChatToBottom(element);
  window.setTimeout(() => scrollChatToBottom(element), 60);
  window.setTimeout(() => scrollChatToBottom(element), 260);
}

function attachChat(element: HTMLElement) {
  if (attachedChats.has(element)) return;
  attachedChats.add(element);

  let followLatest = true;

  element.addEventListener(
    'scroll',
    () => {
      if (!shouldForceFollow(element)) followLatest = isNearBottom(element);
    },
    { passive: true },
  );

  const messageObserver = new MutationObserver(() => {
    if (followLatest || shouldForceFollow(element)) scrollChatToBottom(element);
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

function syncVisualViewport() {
  const viewport = window.visualViewport;
  const height = viewport?.height ?? window.innerHeight;
  const width = viewport?.width ?? window.innerWidth;
  const top = viewport?.offsetTop ?? 0;
  const left = viewport?.offsetLeft ?? 0;

  const root = document.documentElement;
  root.style.setProperty('--app-viewport-height', `${Math.round(height)}px`);
  root.style.setProperty('--app-viewport-width', `${Math.round(width)}px`);
  root.style.setProperty('--app-viewport-top', `${Math.round(top)}px`);
  root.style.setProperty('--app-viewport-left', `${Math.round(left)}px`);
}

function setMobileChatFocus(active: boolean) {
  if (!window.matchMedia(MOBILE_CHAT_QUERY).matches) return;

  if (active) {
    chatFocusScrollY = window.scrollY;
    document.documentElement.classList.add('chat-input-active');
    syncVisualViewport();
    return;
  }

  document.documentElement.classList.remove('chat-input-active');
  requestAnimationFrame(() => window.scrollTo({ top: chatFocusScrollY, behavior: 'auto' }));
}

export function installChatViewportFixes() {
  scanForChats();
  syncVisualViewport();

  const pageObserver = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach(node => {
        if (node instanceof HTMLElement) scanForChats(node);
      });
    }
  });

  pageObserver.observe(document.body, { childList: true, subtree: true });

  document.addEventListener(
    'submit',
    event => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement) || !form.matches('.chat-input')) return;
      const chat = form.closest('.assistant-card')?.querySelector<HTMLElement>(CHAT_SELECTOR);
      if (chat) forceChatToLatest(chat);
    },
    true,
  );

  document.addEventListener('focusin', event => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || !input.matches(CHAT_INPUT_SELECTOR)) return;

    const chat = input.closest('.assistant-card')?.querySelector<HTMLElement>(CHAT_SELECTOR);
    if (!chat) return;

    setMobileChatFocus(true);
    forceChatToLatest(chat);
    window.setTimeout(() => {
      syncVisualViewport();
      forceChatToLatest(chat);
    }, 300);
  });

  document.addEventListener('focusout', event => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || !input.matches(CHAT_INPUT_SELECTOR)) return;

    window.setTimeout(() => {
      const active = document.activeElement;
      if (!(active instanceof HTMLInputElement) || !active.matches(CHAT_INPUT_SELECTOR)) {
        setMobileChatFocus(false);
      }
    }, 120);
  });

  const onViewportChange = () => {
    syncVisualViewport();
    if (!document.documentElement.classList.contains('chat-input-active')) return;
    const active = document.activeElement;
    if (!(active instanceof HTMLInputElement) || !active.matches(CHAT_INPUT_SELECTOR)) return;
    const chat = active.closest('.assistant-card')?.querySelector<HTMLElement>(CHAT_SELECTOR);
    if (chat) scrollChatToBottom(chat);
  };

  window.addEventListener('resize', onViewportChange, { passive: true });
  window.visualViewport?.addEventListener('resize', onViewportChange, { passive: true });
  window.visualViewport?.addEventListener('scroll', onViewportChange, { passive: true });
}
