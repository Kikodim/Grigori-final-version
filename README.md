# Grigori – The Watcher

Grigori is a geopolitical intelligence platform with:
- local development through a root Express server
- Vercel production deployment through serverless `/api/v1/...` handlers
- Gemini for AI enrichment
- multi-source ingestion
- Supabase persistence when configured

## Architecture

Local development uses [server.js](/Users/kirildimitrov/grigori/server.js) through:

```bash
npm run dev
```

Vercel uses the serverless route handlers in:
- [api/v1/health.js](/Users/kirildimitrov/grigori/api/v1/health.js)
- [api/v1/events/index.js](/Users/kirildimitrov/grigori/api/v1/events/index.js)
- [api/v1/events/[id].js](/Users/kirildimitrov/grigori/api/v1/events/[id].js)
- [api/v1/events/stats.js](/Users/kirildimitrov/grigori/api/v1/events/stats.js)
- [api/v1/pipeline/run.js](/Users/kirildimitrov/grigori/api/v1/pipeline/run.js)
- [api/v1/admin/refresh.js](/Users/kirildimitrov/grigori/api/v1/admin/refresh.js)
- [api/v1/ai/status.js](/Users/kirildimitrov/grigori/api/v1/ai/status.js)

Both paths reuse the same business logic in:
- [api-handlers.js](/Users/kirildimitrov/grigori/api-handlers.js)
- [pipeline.js](/Users/kirildimitrov/grigori/pipeline.js)
- [ingest.js](/Users/kirildimitrov/grigori/ingest.js)
- [ai.js](/Users/kirildimitrov/grigori/ai.js)
- [supabase.js](/Users/kirildimitrov/grigori/supabase.js)

Vercel does not use `app.listen()`.

## Local Setup

1. Install dependencies.

```bash
npm install
```

2. Create your local env file from the placeholder template.

```bash
cp .env.local.example .env.local
```

3. Fill in your local secrets in `.env.local`.

4. Start the backend.

```bash
npm run dev
```

## Local Test Commands

```bash
npm run test:health
npm run test:events
curl -X POST http://localhost:3001/api/v1/pipeline/run -H "Authorization: Bearer <ADMIN_SECRET>"
curl -X POST http://localhost:3001/api/v1/admin/refresh -H "Authorization: Bearer <ADMIN_SECRET>"
```

## Environment Variables

Use these exact names locally and in Vercel:

- `NEWS_API_KEY`
- `GEMINI_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ADMIN_SECRET`
- `NODE_ENV`
- `RUN_PIPELINE_ON_STARTUP`
- `INGEST_INTERVAL_MINUTES`
- `ENABLE_AUTOMATED_AI`
- `MAX_AI_CALLS_PER_RUN`
- `AI_DAILY_LIMIT`
- `AI_RESERVED_CALLS`
- `ENABLE_GDELT`
- `ENABLE_RSS`
- `ENABLE_NEWSDATA`
- `ENABLE_CURRENTS`
- `ENABLE_NEWSAPI`
- `NEWSDATA_API_KEY`
- `CURRENTS_API_KEY`
- `RSS_FEED_URLS`

## Security

- No API keys should be committed.
- `.env` and `.env.local` should remain untracked.
- `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, and `NEWS_API_KEY` are server-side only.
- `POST /api/v1/pipeline/run` requires `Authorization: Bearer <ADMIN_SECRET>` for manual use.
- `POST /api/v1/admin/refresh` is a protected alias for manual operator refreshes and uses the same `ADMIN_SECRET` check.
- In production, `RUN_PIPELINE_ON_STARTUP=false` is the safe default.
- Frontend API calls should remain relative, for example `/api/v1/events`.
- The in-app `Admin Refresh` button prompts for `ADMIN_SECRET` at click time and does not persist it.

## Schema

Supabase SQL files in this repo:
- [schema.sql](/Users/kirildimitrov/grigori/schema.sql)
- [supabase_migration_grigori_ai_fields.sql](/Users/kirildimitrov/grigori/supabase_migration_grigori_ai_fields.sql)

## Deployment

Use [DEPLOYMENT.md](/Users/kirildimitrov/grigori/DEPLOYMENT.md) for the exact GitHub, Vercel, DNS, testing, and rollback steps.
