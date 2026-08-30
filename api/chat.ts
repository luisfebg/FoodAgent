type ChatPayload = {
  message?: string;
  interaction?: Record<string, unknown>;
  sessionId?: string;
  householdId?: string;
};

export const maxDuration = 60;

export default {
  async fetch(request: Request) {
    if (request.method !== 'POST') {
      return Response.json({ error: 'Method not allowed' }, { status: 405 });
    }

    const webhookUrl = process.env.N8N_CHAT_WEBHOOK_URL;
    if (!webhookUrl) {
      return Response.json(
        { error: 'Food Agent chat is not configured yet.' },
        { status: 503 },
      );
    }

    let payload: ChatPayload;
    try {
      payload = await request.json() as ChatPayload;
    } catch {
      return Response.json({ error: 'Invalid JSON body.' }, { status: 400 });
    }

    const hasMessage = Boolean(payload.message?.trim());
    const hasInteraction = Boolean(
      payload.interaction &&
      typeof payload.interaction === 'object' &&
      !Array.isArray(payload.interaction),
    );

    if ((!hasMessage && !hasInteraction) || !payload.sessionId || !payload.householdId) {
      return Response.json(
        { error: 'message or interaction, sessionId and householdId are required.' },
        { status: 400 },
      );
    }

    const authorization = request.headers.get('authorization');
    if (!authorization?.startsWith('Bearer ')) {
      return Response.json({ error: 'Authentication required.' }, { status: 401 });
    }

    try {
      const upstream = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authorization,
          'X-Food-Agent-Source': 'vercel-web',
        },
        body: JSON.stringify(payload),
      });

      const body = await upstream.text();
      const contentType = upstream.headers.get('content-type') || 'application/json; charset=utf-8';

      return new Response(body || JSON.stringify({ ok: upstream.ok }), {
        status: upstream.status,
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'no-store',
        },
      });
    } catch (error) {
      console.error('n8n chat proxy failed', error);
      return Response.json(
        { error: 'The Food Agent automation is temporarily unavailable.' },
        { status: 502 },
      );
    }
  },
};
