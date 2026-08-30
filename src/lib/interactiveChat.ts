import { supabase } from './supabase';

type UiOption = {
  id?: string;
  label?: string;
  message?: string;
  interaction?: Record<string, unknown>;
  code?: string;
  description?: string;
};

type MealGroup = {
  label?: string;
  required?: boolean;
  selection?: string;
  options?: UiOption[];
};

type InteractiveUi = {
  type: 'quick_replies' | 'quick_actions' | 'meal_selector';
  question?: string;
  allowFreeText?: boolean;
  actionId?: string;
  field?: string;
  date?: string;
  planId?: string | null;
  options?: UiOption[];
  lunch?: MealGroup;
  dinner?: MealGroup;
  confirm?: {
    label?: string;
    interactionType?: string;
    requiredFields?: string[];
    payloadBase?: Record<string, unknown>;
  };
};

type ChatContext = {
  householdId: string;
  sessionId: string;
  accessToken: string;
  agentSessionId?: string;
};

const CARD_SELECTOR = '.assistant-card:not(.assistant-compact)';
const nativeFetch = window.fetch.bind(window);
let latestUi: InteractiveUi | null = null;
let requestBusy = false;
let requestError = '';
let activeHouseholdId = '';
let activeBrowserSessionId = '';
let installed = false;

function normalizeUi(value: unknown): InteractiveUi | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const ui = value as Record<string, unknown>;
  const type = String(ui.type || '');
  if (!['quick_replies', 'quick_actions', 'meal_selector'].includes(type)) return null;
  return ui as InteractiveUi;
}

function captureOutgoingContext(init?: RequestInit) {
  if (typeof init?.body !== 'string') return;
  try {
    const body = JSON.parse(init.body) as Record<string, unknown>;
    if (typeof body.householdId === 'string') activeHouseholdId = body.householdId;
    if (typeof body.sessionId === 'string') activeBrowserSessionId = body.sessionId;
  } catch {
    // Ignore non-JSON bodies.
  }
}

function isChatUrl(input: RequestInfo | URL) {
  try {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    return new URL(raw, window.location.href).pathname === '/api/chat';
  } catch {
    return false;
  }
}

function ensureBrowserSessionId() {
  const key = 'food-agent-chat-session';
  let id = activeBrowserSessionId || localStorage.getItem(key) || '';
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  activeBrowserSessionId = id;
  return id;
}

function setLatestUi(ui: unknown) {
  latestUi = normalizeUi(ui);
  requestError = '';
  renderAll();
  scrollLatest();
}

function setBusy(busy: boolean, error = '') {
  requestBusy = busy;
  requestError = error;
  renderAll();
}

function scrollLatest() {
  document.querySelectorAll<HTMLElement>(CARD_SELECTOR).forEach(card => {
    const chat = card.querySelector<HTMLElement>('.chat-messages');
    if (!chat) return;
    requestAnimationFrame(() => chat.scrollTo({ top: chat.scrollHeight, behavior: 'smooth' }));
  });
}

function textEl(tag: string, className: string, text: string) {
  const el = document.createElement(tag);
  el.className = className;
  el.textContent = text;
  return el;
}

function makeButton(label: string, className: string, onClick: () => void) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = label;
  button.disabled = requestBusy;
  button.addEventListener('click', onClick);
  return button;
}

async function getChatContext(): Promise<ChatContext> {
  const { data: auth } = await supabase.auth.getSession();
  const accessToken = auth.session?.access_token;
  if (!accessToken) throw new Error('Your session expired. Please sign in again.');

  let query = supabase
    .from('agent_sessions')
    .select('id, household_id')
    .eq('channel', 'web');

  if (activeHouseholdId) query = query.eq('household_id', activeHouseholdId);

  const { data: sessions, error } = await query
    .order('last_message_at', { ascending: false })
    .limit(1);
  if (error) throw error;

  const row = sessions?.[0] as { id?: string; household_id?: string } | undefined;
  const householdId = activeHouseholdId || row?.household_id || '';
  if (!householdId) throw new Error('Could not determine the active household for this chat.');

  activeHouseholdId = householdId;
  return {
    householdId,
    sessionId: ensureBrowserSessionId(),
    accessToken,
    agentSessionId: row?.id,
  };
}

async function readJson(response: Response) {
  const raw = await response.text();
  if (!raw) return {} as Record<string, unknown>;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return { reply: raw } as Record<string, unknown>;
  }
}

async function sendStructured(payload: { message?: string; interaction?: Record<string, unknown> }) {
  if (requestBusy) return;
  setBusy(true);
  try {
    const context = await getChatContext();
    const response = await nativeFetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${context.accessToken}`,
      },
      body: JSON.stringify({
        ...payload,
        sessionId: context.sessionId,
        householdId: context.householdId,
      }),
    });
    const data = await readJson(response);
    if (!response.ok || data.error) throw new Error(String(data.error || `Chat returned HTTP ${response.status}`));
    latestUi = normalizeUi(data.ui);
    requestError = '';
    setBusy(false);
    window.setTimeout(() => void syncPersistedUi(), 500);
    scrollLatest();
  } catch (error) {
    setBusy(false, error instanceof Error ? error.message : 'Could not send that action.');
  }
}

function renderStatus(container: HTMLElement) {
  if (!requestBusy && !requestError) return;
  const status = textEl('div', `structured-ui-status${requestError ? ' error' : ''}`, requestError || 'Working…');
  container.appendChild(status);
}

function renderQuick(container: HTMLElement, ui: InteractiveUi) {
  container.classList.add('structured-chat-quick');
  const title = ui.question?.trim();
  if (title) container.appendChild(textEl('div', 'structured-ui-question', title));

  const options = Array.isArray(ui.options) ? ui.options : [];
  const row = document.createElement('div');
  row.className = 'structured-ui-chips';

  options.forEach(option => {
    const label = String(option.label || option.message || '').trim();
    if (!label) return;
    row.appendChild(makeButton(label, ui.type === 'quick_actions' ? 'structured-action-chip' : 'structured-reply-chip', () => {
      if (option.interaction && typeof option.interaction === 'object') {
        const interaction = {
          ...option.interaction,
          message: String((option.interaction as Record<string, unknown>).message || option.message || label),
        };
        void sendStructured({ interaction });
      } else if (ui.type === 'quick_actions') {
        void sendStructured({
          message: String(option.message || label),
          interaction: { type: 'quick_action', label, message: String(option.message || label) },
        });
      } else {
        void sendStructured({ message: String(option.message || label) });
      }
    }));
  });

  container.appendChild(row);
  renderStatus(container);
}

function renderMealGroup(
  parent: HTMLElement,
  group: MealGroup | undefined,
  name: string,
  selected: { value: string },
  onChange: () => void,
) {
  const wrapper = document.createElement('fieldset');
  wrapper.className = 'meal-choice-group';
  const legend = document.createElement('legend');
  legend.textContent = group?.label || name;
  wrapper.appendChild(legend);

  const options = Array.isArray(group?.options) ? group!.options! : [];
  options.forEach(option => {
    const code = String(option.code || '').trim();
    const label = String(option.label || code).trim();
    if (!code || !label) return;

    const card = document.createElement('label');
    card.className = 'meal-choice-card';
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = `food-agent-${name.toLowerCase()}`;
    input.value = code;
    input.disabled = requestBusy;
    input.addEventListener('change', () => {
      selected.value = code;
      onChange();
      wrapper.querySelectorAll('.meal-choice-card').forEach(node => node.classList.remove('selected'));
      card.classList.add('selected');
    });

    const copy = document.createElement('span');
    copy.className = 'meal-choice-copy';
    const heading = document.createElement('strong');
    heading.textContent = `${code} · ${label}`;
    copy.appendChild(heading);
    if (option.description) copy.appendChild(textEl('small', '', String(option.description)));

    card.append(input, copy);
    wrapper.appendChild(card);
  });

  parent.appendChild(wrapper);
}

function renderMealSelector(container: HTMLElement, ui: InteractiveUi) {
  container.classList.add('structured-meal-selector');
  const heading = document.createElement('div');
  heading.className = 'structured-meal-heading';
  heading.appendChild(textEl('strong', '', 'Choose tomorrow’s meals'));
  if (ui.date) heading.appendChild(textEl('span', '', ui.date));
  container.appendChild(heading);
  container.appendChild(textEl('p', 'structured-meal-help', 'Select one lunch and one dinner, then confirm. You can still type a different request below.'));

  const selectedLunch = { value: '' };
  const selectedDinner = { value: '' };
  const groups = document.createElement('div');
  groups.className = 'meal-choice-groups';

  const confirmLabel = ui.confirm?.label || 'Plan these meals';
  const confirm = makeButton(confirmLabel, 'meal-confirm-button', () => {
    if (!selectedLunch.value || !selectedDinner.value) return;
    const payloadBase = ui.confirm?.payloadBase || {};
    const interaction = {
      ...payloadBase,
      type: 'meal_selection_confirm',
      date: ui.date,
      lunchOptionCode: selectedLunch.value,
      dinnerOptionCode: selectedDinner.value,
      message: `Plan ${selectedLunch.value} for lunch and ${selectedDinner.value} for dinner`,
    };
    void sendStructured({ interaction });
  });
  confirm.disabled = true;

  const updateConfirm = () => {
    confirm.disabled = requestBusy || !selectedLunch.value || !selectedDinner.value;
  };

  renderMealGroup(groups, ui.lunch, 'Lunch', selectedLunch, updateConfirm);
  renderMealGroup(groups, ui.dinner, 'Dinner', selectedDinner, updateConfirm);
  container.append(groups, confirm);
  renderStatus(container);
}

function renderCard(card: HTMLElement) {
  let container = card.querySelector<HTMLElement>('.structured-chat-ui');
  if (!latestUi) {
    container?.remove();
    card.classList.remove('has-structured-ui');
    return;
  }

  if (!container) {
    container = document.createElement('div');
    container.className = 'structured-chat-ui';
    const before = card.querySelector('.quick-prompts') || card.querySelector('.chat-input');
    if (before) card.insertBefore(container, before);
    else card.appendChild(container);
  }

  container.className = 'structured-chat-ui';
  container.replaceChildren();
  card.classList.add('has-structured-ui');

  if (latestUi.type === 'meal_selector') renderMealSelector(container, latestUi);
  else renderQuick(container, latestUi);
}

function renderAll() {
  document.querySelectorAll<HTMLElement>(CARD_SELECTOR).forEach(renderCard);
}

async function syncPersistedUi() {
  if (requestBusy) return;
  try {
    const context = await getChatContext();
    if (!context.agentSessionId) {
      setLatestUi(null);
      return;
    }

    const { data: rows, error } = await supabase
      .from('agent_messages')
      .select('role, raw_payload, created_at')
      .eq('session_id', context.agentSessionId)
      .order('created_at', { ascending: false })
      .limit(1);
    if (error) throw error;

    const row = rows?.[0] as { role?: string; raw_payload?: { ui?: unknown } | null } | undefined;
    setLatestUi(row?.role === 'assistant' ? row.raw_payload?.ui : null);
  } catch (error) {
    console.warn('Could not restore structured chat UI', error);
  }
}

export function installInteractiveChat() {
  if (installed) return;
  installed = true;

  window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const isChat = isChatUrl(input);
    if (isChat) {
      captureOutgoingContext(init);
      latestUi = null;
      requestError = '';
      renderAll();
    }

    const response = await nativeFetch(input, init);
    if (isChat) {
      void response.clone().json().then(data => {
        setLatestUi((data as Record<string, unknown>)?.ui);
        window.setTimeout(() => void syncPersistedUi(), 500);
      }).catch(() => undefined);
    }
    return response;
  }) as typeof window.fetch;

  const observer = new MutationObserver(() => renderAll());
  observer.observe(document.body, { childList: true, subtree: true });

  window.addEventListener('focus', () => void syncPersistedUi());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void syncPersistedUi();
  });

  supabase.auth.onAuthStateChange((_event, session) => {
    if (session) window.setTimeout(() => void syncPersistedUi(), 300);
    else setLatestUi(null);
  });

  window.setTimeout(() => void syncPersistedUi(), 800);
}
