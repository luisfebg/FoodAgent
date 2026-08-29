# Food Agent Web

React + TypeScript + Vite frontend for Food Agent.

## Architecture

- **Vercel** hosts the frontend and `/api/chat` proxy function.
- **Supabase** provides authentication, household data, inventory, shopping, meals, and Realtime updates.
- **n8n** is the AI/action backend. The web app sends chat messages to `/api/chat`, and the Vercel Function forwards them to the private `N8N_CHAT_WEBHOOK_URL`.
- **Google Calendar** remains connected through n8n.

The browser never receives the Supabase secret/service-role key or the n8n webhook URL.

## Vercel environment variables

Add these in **Vercel → Project → Settings → Environment Variables**:

```text
VITE_SUPABASE_URL=https://viwfwbzapbtvcnwhepzq.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<Supabase publishable key>
N8N_CHAT_WEBHOOK_URL=<n8n production webhook URL>
```

`VITE_*` values are intentionally public browser configuration. Never use the Supabase secret/service-role key in a `VITE_*` variable.

`N8N_CHAT_WEBHOOK_URL` is server-side only and should not have the `VITE_` prefix.

After changing Vercel environment variables, redeploy the project so they take effect.

## Local development

```bash
npm install
cp .env.example .env.local
npm run dev
```

The frontend runs on `http://localhost:3000`.

For the `/api/chat` Vercel Function during local development, use the Vercel CLI (`vercel dev`) after linking the project, or test chat on a deployed Preview/Production URL.

## Build check

```bash
npm run build
```

## Chat contract for the next n8n workflow

The Vercel proxy forwards a POST body like:

```json
{
  "message": "I used two eggs",
  "sessionId": "browser-session-uuid",
  "householdId": "supabase-household-uuid"
}
```

It also forwards the signed-in user's Supabase JWT in the `Authorization: Bearer ...` header. The next n8n workflow should verify that token and confirm the user belongs to the supplied household before performing actions.

Expected n8n response:

```json
{
  "ok": true,
  "reply": "Updated your eggs from 6 to 4."
}
```

## Deployment flow

`GitHub main → Vercel production deployment`

Preview branches/PRs can be used for testing before merging to `main` later.
