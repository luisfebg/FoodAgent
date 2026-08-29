import { supabase } from './supabase';

export interface ChatRequest {
  message: string;
  sessionId: string;
  householdId: string;
}

export interface ChatResponse {
  ok?: boolean;
  reply?: string;
  response?: string;
  error?: string;
}

export async function sendToFoodAgent(payload: ChatRequest): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error('Your session expired. Please sign in again.');
  }

  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(payload),
  });

  const raw = await response.text();
  let data: ChatResponse = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    if (!response.ok) throw new Error(raw || `Chat endpoint returned HTTP ${response.status}`);
    return raw || 'Done.';
  }

  if (!response.ok || data.error) {
    throw new Error(data.error || `Chat endpoint returned HTTP ${response.status}`);
  }

  return data.reply || data.response || 'Done.';
}
