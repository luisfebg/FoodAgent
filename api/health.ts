export default {
  fetch() {
    return Response.json({
      ok: true,
      service: 'food-agent-web',
      chatConfigured: Boolean(process.env.N8N_CHAT_WEBHOOK_URL),
      timestamp: new Date().toISOString(),
    }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  },
};
