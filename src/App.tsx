import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import {
  Apple,
  ArrowRight,
  Bot,
  CalendarDays,
  Check,
  ChevronRight,
  CircleAlert,
  Clock3,
  Home,
  LogOut,
  Menu,
  MessageCircle,
  PackageOpen,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShoppingBasket,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { supabase } from './lib/supabase';
import { sendToFoodAgent } from './lib/chat';
import type { ChatMessage, Household, InventoryEvent, InventoryItem, Meal, ShoppingItem, ViewName } from './types';

const NAV: { id: ViewName; label: string; icon: typeof Home }[] = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'inventory', label: 'Inventory', icon: PackageOpen },
  { id: 'meals', label: 'Meals', icon: CalendarDays },
  { id: 'shopping', label: 'Shopping', icon: ShoppingBasket },
  { id: 'assistant', label: 'Assistant', icon: MessageCircle },
];

function formatQty(qty: number | null, unit: string | null) {
  if (qty === null) return 'Quantity pending';
  return `${qty} ${unit || ''}`.trim();
}

function daysUntil(date: string | null) {
  if (!date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(`${date}T00:00:00`);
  return Math.ceil((expiry.getTime() - today.getTime()) / 86400000);
}

function getSessionId() {
  const key = 'food-agent-chat-session';
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return id;
}

function LoginScreen() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { display_name: name.trim() || email.split('@')[0] } },
        });
        if (error) throw error;
        setMessage('Account created. If email confirmation is enabled, check your inbox, then sign in.');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-shell">
      <section className="auth-story">
        <div className="brand-mark"><Apple size={22} /><span>Food Agent</span></div>
        <div className="auth-copy">
          <span className="eyebrow eyebrow-light">YOUR KITCHEN, IN SYNC</span>
          <h1>Know what you have.<br />Decide what to eat.</h1>
          <p>Inventory, meal planning, shopping and your AI kitchen assistant in one calm workspace.</p>
          <div className="auth-pills">
            <span>Live inventory</span><span>Meal planning</span><span>AI assistant</span>
          </div>
        </div>
        <div className="auth-orbit">
          <div className="orbit-card orbit-a"><span>Fridge</span><strong>12 items</strong></div>
          <div className="orbit-card orbit-b"><span>Tonight</span><strong>Chicken fajitas</strong></div>
          <div className="orbit-card orbit-c"><span>Use soon</span><strong>Spinach · 2 days</strong></div>
        </div>
      </section>

      <section className="auth-panel">
        <form className="auth-form" onSubmit={submit}>
          <div className="mobile-brand"><Apple size={20} /> Food Agent</div>
          <span className="eyebrow">WELCOME</span>
          <h2>{mode === 'signin' ? 'Sign in to your kitchen' : 'Create your Food Agent'}</h2>
          <p className="muted">Your account keeps each household’s inventory and meal data private.</p>

          {mode === 'signup' && (
            <label>
              <span>Name</span>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Alex" />
            </label>
          )}
          <label>
            <span>Email</span>
            <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" />
          </label>
          <label>
            <span>Password</span>
            <input type="password" required minLength={6} value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" />
          </label>

          {message && <div className="form-message">{message}</div>}

          <button className="primary-button full" disabled={busy}>
            {busy ? <RefreshCw className="spin" size={17} /> : null}
            {mode === 'signin' ? 'Sign in' : 'Create account'}
            {!busy && <ArrowRight size={17} />}
          </button>
          <button type="button" className="text-button" onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setMessage(''); }}>
            {mode === 'signin' ? 'Need an account? Create one' : 'Already have an account? Sign in'}
          </button>
        </form>
      </section>
    </div>
  );
}

function Assistant({ householdId, compact = false }: { householdId: string; compact?: boolean }) {
  const welcomeMessage: ChatMessage = {
    id: 'welcome',
    role: 'assistant',
    content: 'Hi — I’m your Food Agent. Tell me what you bought, what you used, or ask me what to cook.',
    createdAt: new Date().toISOString(),
  };
  const [messages, setMessages] = useState<ChatMessage[]>([welcomeMessage]);
  const [agentSessionId, setAgentSessionId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);

  const loadConversation = useCallback(async (silent = false) => {
    if (!silent) setHistoryLoading(true);
    try {
      const { data: sessions, error: sessionError } = await supabase
        .from('agent_sessions')
        .select('id')
        .eq('household_id', householdId)
        .eq('channel', 'web')
        .order('last_message_at', { ascending: false })
        .limit(1);
      if (sessionError) throw sessionError;

      const sessionId = sessions?.[0]?.id as string | undefined;
      if (!sessionId) {
        setAgentSessionId(null);
        setMessages([welcomeMessage]);
        return;
      }

      setAgentSessionId(sessionId);
      const { data: rows, error: messageError } = await supabase
        .from('agent_messages')
        .select('id, role, content, created_at')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: false })
        .limit(50);
      if (messageError) throw messageError;

      const loaded = (rows || [])
        .filter(row => row.role === 'user' || row.role === 'assistant')
        .reverse()
        .map(row => ({
          id: row.id,
          role: row.role as 'user' | 'assistant',
          content: row.content,
          createdAt: row.created_at,
        }));
      setMessages(loaded.length ? loaded : [welcomeMessage]);
      localStorage.removeItem('food-agent-chat-history');
    } catch (err) {
      console.error('Could not load Food Agent conversation', err);
    } finally {
      if (!silent) setHistoryLoading(false);
    }
  }, [householdId]);

  useEffect(() => {
    void loadConversation();
    const refresh = () => void loadConversation(true);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [loadConversation]);

  useEffect(() => {
    if (!agentSessionId) return;
    const channel = supabase
      .channel(`food-agent-chat-${agentSessionId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'agent_messages', filter: `session_id=eq.${agentSessionId}` },
        () => void loadConversation(true),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [agentSessionId, loadConversation]);

  async function send(message = input) {
    const trimmed = message.trim();
    if (!trimmed || busy) return;
    setInput('');
    setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'user', content: trimmed, createdAt: new Date().toISOString() }]);
    setBusy(true);
    try {
      const reply = await sendToFoodAgent({ message: trimmed, sessionId: getSessionId(), householdId });
      setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'assistant', content: reply, createdAt: new Date().toISOString() }]);
      await loadConversation(true);
    } catch (err) {
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(), role: 'assistant',
        content: err instanceof Error ? err.message : 'I could not reach the automation.',
        createdAt: new Date().toISOString(),
      }]);
    } finally {
      setBusy(false);
    }
  }

  const quick = ['What can I cook tonight?', 'Show my shopping list', 'What should I use soon?'];

  return (
    <section className={`assistant-card ${compact ? 'assistant-compact' : ''}`}>
      <header className="assistant-header">
        <div className="assistant-title"><span className="assistant-icon"><Sparkles size={18} /></span><div><strong>Kitchen assistant</strong><small>n8n + Supabase</small></div></div>
        <span className="online-dot">Online</span>
      </header>
      <div className="chat-messages">
        {messages.slice(compact ? -5 : -20).map(message => (
          <div key={message.id} className={`chat-row ${message.role}`}>
            <div className="chat-avatar">{message.role === 'assistant' ? <Bot size={15} /> : 'You'}</div>
            <div className="chat-bubble">{message.content}</div>
          </div>
        ))}
        {historyLoading && !busy && <div className="chat-row assistant"><div className="chat-avatar"><Bot size={15} /></div><div className="chat-bubble thinking"><span /><span /><span /></div></div>}
        {busy && <div className="chat-row assistant"><div className="chat-avatar"><Bot size={15} /></div><div className="chat-bubble thinking"><span /><span /><span /></div></div>}
      </div>
      {!compact && (
        <div className="quick-prompts">
          {quick.map(q => <button key={q} onClick={() => void send(q)}>{q}</button>)}
        </div>
      )}
      <form className="chat-input" onSubmit={e => { e.preventDefault(); void send(); }}>
        <input value={input} onChange={e => setInput(e.target.value)} placeholder="Ask about food, meals or shopping…" />
        <button disabled={busy || !input.trim()} aria-label="Send"><Send size={18} /></button>
      </form>
    </section>
  );
}

function AddInventoryModal({ householdId, user, onClose, onSaved }: { householdId: string; user: User; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unit, setUnit] = useState('items');
  const [location, setLocation] = useState('Fridge');
  const [category, setCategory] = useState('Other');
  const [expiry, setExpiry] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.from('inventory_items').insert({
      household_id: householdId,
      item_name: name.trim(),
      quantity: Number(quantity),
      unit: unit.trim() || null,
      location,
      category,
      expiry_date: expiry || null,
      source: 'web',
      created_by: user.id,
    });
    setBusy(false);
    if (error) return alert(error.message);
    onSaved();
    onClose();
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <form className="modal" onSubmit={submit} onMouseDown={e => e.stopPropagation()}>
        <div className="modal-head"><div><span className="eyebrow">INVENTORY</span><h3>Add food</h3></div><button type="button" onClick={onClose}><X size={18} /></button></div>
        <label><span>Item name</span><input required value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Greek yoghurt" autoFocus /></label>
        <div className="form-grid two">
          <label><span>Quantity</span><input required type="number" min="0" step="any" value={quantity} onChange={e => setQuantity(e.target.value)} /></label>
          <label><span>Unit</span><input value={unit} onChange={e => setUnit(e.target.value)} placeholder="items, g, ml…" /></label>
        </div>
        <div className="form-grid two">
          <label><span>Location</span><select value={location} onChange={e => setLocation(e.target.value)}><option>Fridge</option><option>Freezer</option><option>Pantry</option><option>Counter</option><option>Other</option></select></label>
          <label><span>Category</span><select value={category} onChange={e => setCategory(e.target.value)}><option>Other</option><option>Vegetables</option><option>Fruit</option><option>Meat</option><option>Fish</option><option>Dairy</option><option>Grains</option><option>Bakery</option><option>Beverages</option><option>Sauces</option></select></label>
        </div>
        <label><span>Expiry date <em>optional</em></span><input type="date" value={expiry} onChange={e => setExpiry(e.target.value)} /></label>
        <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={busy}>{busy ? 'Saving…' : 'Add item'}</button></div>
      </form>
    </div>
  );
}

function InventoryGrid({ items, onDelete }: { items: InventoryItem[]; onDelete: (id: string) => void }) {
  if (!items.length) return <div className="empty"><PackageOpen size={28} /><strong>Your inventory is empty</strong><span>Add food manually or tell the assistant what you bought.</span></div>;
  return (
    <div className="inventory-grid">
      {items.map(item => {
        const d = daysUntil(item.expiry_date);
        const urgency = d !== null && d <= 2 ? 'urgent' : d !== null && d <= 5 ? 'soon' : '';
        return (
          <article className="food-card" key={item.id}>
            <div className="food-card-top"><span className="food-symbol">{item.category?.toLowerCase().includes('fruit') ? '🍎' : item.category?.toLowerCase().includes('veget') ? '🥬' : item.category?.toLowerCase().includes('dairy') ? '🥛' : item.category?.toLowerCase().includes('meat') ? '🍗' : '🥫'}</span><button className="icon-button danger" onClick={() => onDelete(item.id)} title="Remove"><Trash2 size={15} /></button></div>
            <strong>{item.item_name}</strong>
            <span className="food-meta">{formatQty(item.quantity, item.unit)} · {item.location}</span>
            <div className="food-card-bottom"><span className={`expiry ${urgency}`}>{item.expiry_date ? (d === 0 ? 'Expires today' : d !== null && d > 0 ? `${d}d left` : 'Expired') : 'No expiry'}</span><span className="category-pill">{item.category}</span></div>
          </article>
        );
      })}
    </div>
  );
}

function HomeView({ inventory, shopping, meals, events, householdId, setView }: { inventory: InventoryItem[]; shopping: ShoppingItem[]; meals: Meal[]; events: InventoryEvent[]; householdId: string; setView: (v: ViewName) => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const todayMeals = meals.filter(m => m.meal_date === today);
  const useSoon = inventory.filter(i => { const d = daysUntil(i.expiry_date); return d !== null && d >= 0 && d <= 4; }).sort((a,b) => (a.expiry_date || '').localeCompare(b.expiry_date || '')).slice(0,4);
  return (
    <div className="view-stack">
      <section className="hero-row">
        <div><span className="eyebrow">GOOD TO SEE YOU</span><h1>Your kitchen at a glance.</h1><p>Food Agent keeps inventory, meals and shopping connected — and n8n handles the actions behind the assistant.</p></div>
        <button className="primary-button" onClick={() => setView('assistant')}><Sparkles size={17} /> Ask Food Agent</button>
      </section>

      <section className="metric-grid">
        <button className="metric-card" onClick={() => setView('inventory')}><span className="metric-icon green"><PackageOpen size={18} /></span><div><small>Available food</small><strong>{inventory.length}</strong><span>active items</span></div><ChevronRight size={17} /></button>
        <button className="metric-card" onClick={() => setView('inventory')}><span className="metric-icon amber"><Clock3 size={18} /></span><div><small>Use soon</small><strong>{useSoon.length}</strong><span>within 4 days</span></div><ChevronRight size={17} /></button>
        <button className="metric-card" onClick={() => setView('shopping')}><span className="metric-icon blue"><ShoppingBasket size={18} /></span><div><small>Shopping list</small><strong>{shopping.length}</strong><span>active items</span></div><ChevronRight size={17} /></button>
        <button className="metric-card" onClick={() => setView('meals')}><span className="metric-icon purple"><CalendarDays size={18} /></span><div><small>Today</small><strong>{todayMeals.length}</strong><span>planned meals</span></div><ChevronRight size={17} /></button>
      </section>

      <section className="home-grid">
        <div className="panel span-7">
          <div className="panel-head"><div><span className="eyebrow">USE FIRST</span><h2>Food to use soon</h2></div><button className="text-link" onClick={() => setView('inventory')}>View inventory <ArrowRight size={14}/></button></div>
          {useSoon.length ? <div className="use-soon-list">{useSoon.map(item => <div className="use-soon-row" key={item.id}><span className="food-symbol small">🥬</span><div><strong>{item.item_name}</strong><small>{formatQty(item.quantity,item.unit)} · {item.location}</small></div><span className="date-chip">{daysUntil(item.expiry_date)}d left</span></div>)}</div> : <div className="empty-inline"><Check size={18}/> Nothing urgent right now.</div>}
        </div>
        <div className="span-5"><Assistant householdId={householdId} compact /></div>
      </section>

      <section className="home-grid">
        <div className="panel span-6">
          <div className="panel-head"><div><span className="eyebrow">TODAY</span><h2>Meals</h2></div><button className="text-link" onClick={() => setView('meals')}>Open planner <ArrowRight size={14}/></button></div>
          <div className="meal-mini-list">{todayMeals.length ? todayMeals.map(meal => <div className="meal-mini" key={meal.id}><span>{meal.meal_type}</span><strong>{meal.dish}</strong><small className={`status status-${meal.status}`}>{meal.status}</small></div>) : <div className="empty-inline"><CalendarDays size={18}/> No meals scheduled today.</div>}</div>
        </div>
        <div className="panel span-6">
          <div className="panel-head"><div><span className="eyebrow">RECENT</span><h2>Inventory activity</h2></div></div>
          <div className="activity-list">{events.slice(0,5).map(ev => <div className="activity-row" key={ev.id}><span className="activity-dot"/><div><strong>{ev.event_type.replaceAll('_',' ').toLowerCase()}</strong><small>{ev.notes || 'Inventory changed'}</small></div><time>{new Date(ev.created_at).toLocaleDateString(undefined,{month:'short',day:'numeric'})}</time></div>)}{!events.length && <div className="empty-inline">No inventory activity yet.</div>}</div>
        </div>
      </section>
    </div>
  );
}

function InventoryView({ items, search, setSearch, onAdd, onDelete }: { items: InventoryItem[]; search: string; setSearch: (v:string)=>void; onAdd:()=>void; onDelete:(id:string)=>void }) {
  const filtered = items.filter(item => `${item.item_name} ${item.category} ${item.location}`.toLowerCase().includes(search.toLowerCase()));
  return <div className="view-stack"><section className="page-heading"><div><span className="eyebrow">INVENTORY</span><h1>What’s in the kitchen</h1><p>{items.length} active items across your fridge, freezer and pantry.</p></div><button className="primary-button" onClick={onAdd}><Plus size={17}/> Add food</button></section><div className="toolbar"><div className="search-box"><Search size={17}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search food, category or location…"/></div><span>{filtered.length} shown</span></div><InventoryGrid items={filtered} onDelete={onDelete}/></div>;
}

function MealsView({ meals }: { meals: Meal[] }) {
  const grouped = useMemo(() => {
    const map = new Map<string, Meal[]>();
    meals.forEach(m => map.set(m.meal_date, [...(map.get(m.meal_date)||[]), m]));
    return [...map.entries()].sort(([a],[b]) => a.localeCompare(b)).slice(0,14);
  }, [meals]);
  return <div className="view-stack"><section className="page-heading"><div><span className="eyebrow">MEAL PLAN</span><h1>Your scheduled meals</h1><p>Meals created or changed by the assistant stay connected to Google Calendar.</p></div></section><div className="meal-days">{grouped.length ? grouped.map(([date,list]) => <section className="meal-day" key={date}><div className="meal-date"><strong>{new Date(`${date}T12:00:00`).toLocaleDateString(undefined,{weekday:'short'})}</strong><span>{new Date(`${date}T12:00:00`).toLocaleDateString(undefined,{month:'short',day:'numeric'})}</span></div><div className="meal-day-items">{list.map(m => <article key={m.id}><span>{m.meal_type}</span><strong>{m.dish}</strong><small className={`status status-${m.status}`}>{m.status}</small></article>)}</div></section>) : <div className="empty"><CalendarDays size={28}/><strong>No meals planned yet</strong><span>Ask the assistant for lunch and dinner options, then schedule the ones you like.</span></div>}</div></div>;
}

function ShoppingView({ items, reload }: { items: ShoppingItem[]; reload:()=>void }) {
  async function toggle(item: ShoppingItem) {
    const { error } = await supabase.from('shopping_items').update({ status:'purchased', purchased_at:new Date().toISOString() }).eq('id',item.id);
    if (error) alert(error.message); else reload();
  }
  return <div className="view-stack"><section className="page-heading"><div><span className="eyebrow">SHOPPING</span><h1>Shopping list</h1><p>Items added manually or by your Food Agent.</p></div></section><div className="shopping-list">{items.length ? items.map(item => <article key={item.id} className="shopping-row"><button className="check-button" onClick={()=>void toggle(item)}><Check size={15}/></button><div><strong>{item.item_name}</strong><small>{item.needed_quantity !== null ? `${item.needed_quantity} ${item.unit||''}` : 'Quantity not specified'} · {item.category}</small></div><span className={`priority priority-${item.priority}`}>{item.priority}</span></article>) : <div className="empty"><ShoppingBasket size={28}/><strong>Your shopping list is empty</strong><span>Tell the assistant “add milk to my shopping list” or add items from a recipe later.</span></div>}</div></div>;
}

function AppShell({ session }: { session: Session }) {
  const [view, setView] = useState<ViewName>('home');
  const [menuOpen, setMenuOpen] = useState(false);
  const [household, setHousehold] = useState<Household | null>(null);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [shopping, setShopping] = useState<ShoppingItem[]>([]);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [events, setEvents] = useState<InventoryEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [fatal, setFatal] = useState('');
  const [search, setSearch] = useState('');
  const [addOpen, setAddOpen] = useState(false);

  const loadData = useCallback(async (householdId: string) => {
    const [inv, shop, meal, activity] = await Promise.all([
      supabase.from('available_inventory').select('*').eq('household_id', householdId).order('updated_at',{ascending:false}),
      supabase.from('active_shopping_items').select('*').eq('household_id', householdId).order('created_at',{ascending:false}),
      supabase.from('meals').select('*').eq('household_id', householdId).order('meal_date',{ascending:true}),
      supabase.from('inventory_events').select('*').eq('household_id', householdId).order('created_at',{ascending:false}).limit(20),
    ]);
    const error = inv.error || shop.error || meal.error || activity.error;
    if (error) throw error;
    setInventory((inv.data || []) as InventoryItem[]);
    setShopping((shop.data || []) as ShoppingItem[]);
    setMeals((meal.data || []) as Meal[]);
    setEvents((activity.data || []) as InventoryEvent[]);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let realtimeChannel: ReturnType<typeof supabase.channel> | null = null;

    async function boot() {
      try {
        setLoading(true);
        const { data: memberships, error: membershipError } = await supabase
          .from('household_members')
          .select('household_id, joined_at')
          .eq('profile_id', session.user.id)
          .order('joined_at', { ascending: true })
          .limit(1);
        if (membershipError) throw membershipError;

        let householdId = memberships?.[0]?.household_id as string | undefined;
        if (!householdId) {
          const { data: created, error: createError } = await supabase
            .from('households')
            .insert({ name: 'My Home', created_by: session.user.id })
            .select('id')
            .single();
          if (createError) throw createError;
          householdId = created.id;
          await supabase.from('user_preferences').upsert({ household_id: householdId, profile_id: session.user.id }, { onConflict: 'household_id,profile_id' });
        }

        const { data: h, error: hError } = await supabase.from('households').select('*').eq('id', householdId).single();
        if (hError) throw hError;
        if (cancelled) return;
        setHousehold(h as Household);
        await loadData(householdId);
        if (cancelled) return;

        realtimeChannel = supabase.channel(`food-agent-${householdId}`)
          .on('postgres_changes',{event:'*',schema:'public',table:'inventory_items',filter:`household_id=eq.${householdId}`},()=>void loadData(householdId))
          .on('postgres_changes',{event:'*',schema:'public',table:'shopping_items',filter:`household_id=eq.${householdId}`},()=>void loadData(householdId))
          .on('postgres_changes',{event:'*',schema:'public',table:'meals',filter:`household_id=eq.${householdId}`},()=>void loadData(householdId))
          .on('postgres_changes',{event:'*',schema:'public',table:'inventory_events',filter:`household_id=eq.${householdId}`},()=>void loadData(householdId))
          .subscribe();
      } catch (err) {
        if (!cancelled) setFatal(err instanceof Error ? err.message : 'Could not load your household.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void boot();
    return () => {
      cancelled = true;
      if (realtimeChannel) void supabase.removeChannel(realtimeChannel);
    };
  }, [loadData, session.user.id]);

  async function removeInventory(id: string) {
    if (!confirm('Remove this item from active inventory?')) return;
    const { error } = await supabase.from('inventory_items').update({status:'archived'}).eq('id',id);
    if (error) alert(error.message); else if (household) void loadData(household.id);
  }

  if (loading) return <div className="loading-screen"><div className="brand-mark dark"><Apple size={20}/><span>Food Agent</span></div><RefreshCw className="spin"/><p>Opening your kitchen…</p></div>;
  if (fatal || !household) return <div className="loading-screen error"><CircleAlert/><h2>Could not open Food Agent</h2><p>{fatal || 'Household setup failed.'}</p><button className="primary-button" onClick={()=>location.reload()}>Try again</button></div>;

  const currentNav = NAV.find(n => n.id === view)!;
  const displayName = session.user.user_metadata?.display_name || session.user.email?.split('@')[0] || 'You';

  return (
    <div className="app-shell">
      <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
        <div className="sidebar-top"><div className="brand-mark dark"><Apple size={20}/><span>Food Agent</span></div><button className="mobile-close" onClick={()=>setMenuOpen(false)}><X size={19}/></button></div>
        <nav>{NAV.map(item => { const Icon=item.icon; return <button key={item.id} className={view===item.id?'active':''} onClick={()=>{setView(item.id);setMenuOpen(false)}}><Icon size={18}/><span>{item.label}</span>{view===item.id&&<span className="nav-indicator"/>}</button>; })}</nav>
        <div className="sidebar-tip"><Sparkles size={17}/><strong>Try this</strong><span>“I used all the milk. What can I cook tonight?”</span></div>
        <button className="profile-button" onClick={()=>void supabase.auth.signOut()}><span className="profile-avatar">{displayName.slice(0,1).toUpperCase()}</span><div><strong>{displayName}</strong><small>{household.name}</small></div><LogOut size={16}/></button>
      </aside>
      {menuOpen && <div className="menu-scrim" onClick={()=>setMenuOpen(false)}/>} 

      <main className="main-area">
        <header className="topbar"><div className="topbar-left"><button className="menu-button" onClick={()=>setMenuOpen(true)}><Menu size={20}/></button><div><small>{household.name}</small><strong>{currentNav.label}</strong></div></div><div className="topbar-right"><span className="sync-pill"><span className="sync-dot"/> Live with Supabase</span><button className="assistant-shortcut" onClick={()=>setView('assistant')}><Sparkles size={16}/> Ask</button></div></header>
        <div className="workspace">
          {view==='home' && <HomeView inventory={inventory} shopping={shopping} meals={meals} events={events} householdId={household.id} setView={setView}/>} 
          {view==='inventory' && <InventoryView items={inventory} search={search} setSearch={setSearch} onAdd={()=>setAddOpen(true)} onDelete={(id)=>void removeInventory(id)}/>} 
          {view==='meals' && <MealsView meals={meals}/>} 
          {view==='shopping' && <ShoppingView items={shopping} reload={()=>void loadData(household.id)}/>} 
          {view==='assistant' && <div className="assistant-page"><div className="assistant-page-copy"><span className="eyebrow">FOOD AGENT</span><h1>Talk to your kitchen.</h1><p>Chat replaces Telegram as the trigger. n8n interprets the request, changes Supabase or Google Calendar, and sends the result back here.</p></div><Assistant householdId={household.id}/></div>}
        </div>
      </main>
      {addOpen && <AddInventoryModal householdId={household.id} user={session.user} onClose={()=>setAddOpen(false)} onSaved={()=>void loadData(household.id)}/>} 
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  useEffect(() => {
    void supabase.auth.getSession().then(({data}) => setSession(data.session));
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, current) => setSession(current));
    return () => subscription.subscription.unsubscribe();
  }, []);
  if (session === undefined) return <div className="loading-screen"><RefreshCw className="spin"/></div>;
  return session ? <AppShell session={session}/> : <LoginScreen/>;
}
