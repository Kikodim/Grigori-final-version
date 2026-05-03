# Grigori Deployment Checklist

## 1. Final Local Checks

From the repo root:

```bash
npm install
cp .env.local.example .env.local
npm run predeploy:check
npm run build
npm run dev
```

In another terminal:

```bash
npm run test:health
npm run test:events
curl -X POST http://localhost:3001/api/v1/pipeline/run -H "Authorization: Bearer <ADMIN_SECRET>"
curl -X POST http://localhost:3001/api/v1/admin/refresh -H "Authorization: Bearer <ADMIN_SECRET>"
```

Optional extra checks:

```bash
curl http://localhost:3001/api/v1/events/stats
curl http://localhost:3001/api/v1/ai/status
```

## 2. GitHub Push

Initialize git if needed:

```bash
git init
git add .
git status
```

Confirm `.env.local` is not listed in `git status`.

Create the first commit:

```bash
git commit -m "Prepare Grigori for Vercel deployment"
```

Connect your GitHub repo and push:

```bash
git branch -M main
git remote add origin https://github.com/<YOUR_GITHUB_USERNAME>/<YOUR_REPO_NAME>.git
git push -u origin main
```

## 3. Vercel Import Steps

1. Go to [Vercel](https://vercel.com/).
2. Click `Add New...` then `Project`.
3. Import the GitHub repository for Grigori.
4. Keep the framework preset as `Other`.
5. Leave the root directory as the repo root.
6. Do not point Vercel at `server.js`.
7. Vercel will use the serverless handlers under `/api/v1/...` automatically.
8. Add environment variables before the first production deploy.
9. On Vercel Hobby, the built-in cron should stay daily. More frequent automated ingestion should be handled later with Vercel Pro, GitHub Actions, an external cron service, or manual protected refresh calls.
10. Vercel should detect the `build` script and publish the Vite frontend at `/` while keeping `/api/v1/*` as serverless routes.

## 4. Vercel Environment Variables

Add these exact names in:

`Vercel Dashboard -> Project -> Settings -> Environment Variables`

Required:

```text
NEWS_API_KEY
GEMINI_API_KEY
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
ADMIN_SECRET
ENABLE_MARKET_DATA
MARKET_DATA_PROVIDER
MARKET_DATA_API_KEY
MARKET_DATA_REFRESH_INTERVAL_MINUTES
MARKET_DATA_DAILY_LIMIT
NODE_ENV
RUN_PIPELINE_ON_STARTUP
INGEST_INTERVAL_MINUTES
ENABLE_AUTOMATED_AI
MAX_AI_CALLS_PER_RUN
AI_DAILY_LIMIT
AI_RESERVED_CALLS
ENABLE_REPORT_AI
GEMINI_REPORT_DAILY_LIMIT
GEMINI_REPORT_MAX_EVENTS
GEMINI_REPORT_MIN_EVENTS
ENABLE_GDELT
ENABLE_RSS
ENABLE_NEWSDATA
ENABLE_CURRENTS
ENABLE_GNEWS
ENABLE_NEWSAPI
NEWSDATA_API_KEY
CURRENTS_API_KEY
GNEWS_API_KEY
GNEWS_DAILY_LIMIT
GNEWS_MAX_CALLS_PER_REFRESH
GNEWS_REFRESH_EVERY_MINUTES
ENABLE_GNEWS_BACKFILL
RSS_FEED_URLS
```

Recommended production values:

```text
NODE_ENV=production
RUN_PIPELINE_ON_STARTUP=false
INGEST_INTERVAL_MINUTES=90
ENABLE_AUTOMATED_AI=true
MAX_AI_CALLS_PER_RUN=1
AI_DAILY_LIMIT=20
AI_RESERVED_CALLS=2
ENABLE_REPORT_AI=true
GEMINI_REPORT_DAILY_LIMIT=2
GEMINI_REPORT_MAX_EVENTS=30
GEMINI_REPORT_MIN_EVENTS=3
ENABLE_MARKET_DATA=false
MARKET_DATA_PROVIDER=alpha_vantage
MARKET_DATA_REFRESH_INTERVAL_MINUTES=60
MARKET_DATA_DAILY_LIMIT=20
ENABLE_HISTORICAL_BACKFILL=true
BACKFILL_MAX_DAYS=30
BACKFILL_BATCH_DAYS=3
BACKFILL_MAX_ARTICLES_PER_BATCH=50
MAX_CONFLICT_ZONES=20
ENABLE_GDELT=true
ENABLE_RSS=true
ENABLE_NEWSDATA=true
ENABLE_CURRENTS=true
ENABLE_GNEWS=true
ENABLE_NEWSAPI=true
GNEWS_DAILY_LIMIT=100
GNEWS_MAX_CALLS_PER_REFRESH=4
GNEWS_REFRESH_EVERY_MINUTES=60
ENABLE_GNEWS_BACKFILL=false
```

Reports Alpha notes:

- Report generation is manual only and uses Gemini only.
- No report generation runs on page load or in the background.
- The alpha is tuned for 1–2 reports per day via `GEMINI_REPORT_DAILY_LIMIT`.
- Public users should stay in preview mode; use sign-in or admin unlock for controlled testing.

## 5. Production Test Commands

Replace `YOUR_DOMAIN` and `YOUR_ADMIN_SECRET`.

```bash
curl https://YOUR_DOMAIN/api/v1/health
curl https://YOUR_DOMAIN/api/v1/events
curl https://YOUR_DOMAIN/api/v1/events/stats
curl https://YOUR_DOMAIN/api/v1/ai/status
curl -X POST https://YOUR_DOMAIN/api/v1/pipeline/run -H "Authorization: Bearer YOUR_ADMIN_SECRET"
curl -X POST https://YOUR_DOMAIN/api/v1/admin/refresh -H "Authorization: Bearer YOUR_ADMIN_SECRET"
curl -X POST "https://YOUR_DOMAIN/api/v1/admin/refresh?mode=backfill&days=30" -H "Authorization: Bearer YOUR_ADMIN_SECRET"
```

## 6. Hostinger DNS For `grigori.oryth.io`

1. Open the Hostinger DNS zone for `oryth.io`.
2. Add a `CNAME` record:
   - Name: `grigori`
   - Target: the Vercel target shown in your project domain settings, usually `cname.vercel-dns.com`
3. If Hostinger requires apex verification support, copy any TXT records Vercel asks for into the same DNS zone.
4. In Vercel:
   - open the project
   - go to `Settings -> Domains`
   - add `grigori.oryth.io`
   - wait for verification and SSL issuance

## 7. Refresh Automation Troubleshooting

Grigori's live data depends on GitHub Actions calling the protected production refresh endpoint. If the app shows stored signals for too long, check the automation path first.

1. Check recent GitHub Actions runs for `News Refresh` and `AI Refresh`.
2. Run the `Production Smoke Test` workflow manually.
3. Confirm `.github/workflows/news-refresh.yml` and `.github/workflows/ai-refresh.yml` exist on the default branch.
4. Verify the GitHub secret `GRIGORI_ADMIN_SECRET` matches the Vercel production `ADMIN_SECRET`.
5. Verify Vercel production env vars are present for Supabase, providers, Gemini, and `ADMIN_SECRET`.
6. Check provider quotas and rate limits in `/api/v1/health`.
7. Check Supabase writes through the health data source and refresh metadata.
8. Run a manual news refresh if scheduled news is overdue.
9. Run a manual AI refresh if scheduled AI is overdue.
10. Compare `/api/v1/events?scope=active` with `/api/v1/events/stats` if active signals look empty.

```bash
curl -sS "https://grigori.oryth.io/api/v1/health"
```

```bash
curl -sS -X POST "https://grigori.oryth.io/api/v1/admin/refresh?mode=news&source=manual" \
  -H "Authorization: Bearer YOUR_ADMIN_SECRET"
```

```bash
curl -sS -X POST "https://grigori.oryth.io/api/v1/admin/refresh?mode=ai&source=manual" \
  -H "Authorization: Bearer YOUR_ADMIN_SECRET"
```

Healthy automation should expose these fields in `/api/v1/health`:

- `automation.news.lastScheduledRunAt`
- `automation.news.lastScheduledSuccessAt`
- `automation.ai.lastScheduledRunAt`
- `automation.ai.lastScheduledSuccessAt`
- `automation.lastNewsRefreshAt`
- `automation.lastAiRefreshAt`
- `data.cacheStatus`
- `data.activeEventCount`

If News Refresh returns `save_failed`, `event_persistence_failed`, or `persistence_failed`, check:

1. Vercel Production has `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
2. `SUPABASE_SERVICE_ROLE_KEY` is the service role key for the same Supabase project used by production.
3. `/api/v1/health` shows `data.supabaseStatus=ok`.
4. `refresh.result.persistenceErrors` for the exact table, operation, code, message, hint, and rejected fields.
5. Required event freshness migrations have been applied:
   - `supabase_migration_grigori_event_freshness.sql`
   - `supabase_migration_grigori_active_scope_backfill.sql`
   - `supabase_migration_grigori_newest_source_at.sql`
6. Live layer/cache migration has been applied if refresh state rows are failing:
   - `supabase_migration_grigori_live_layers.sql`
7. Reports migrations have been applied if Reports Alpha is enabled:
   - `supabase_migration_grigori_reports_alpha.sql`

If AI Refresh returns `ai_event_update_failed` or `heartbeat_persistence_failed`, check:

1. The `events` table has `ai_status`, `ai_updated_at`, `summary`, `assessment`, `scenarios`, `source_assessment`, and related enrichment columns from `schema.sql`.
2. The response `persistenceErrors` entry identifies whether the failure is the event update or the scheduled heartbeat.
3. The AI workflow did not retry after `aiCallsUsed > 0`; this protects Gemini quota while persistence is broken.
4. `/api/v1/health` shows `automation.ai.lastScheduledSuccessAt` after a successful scheduled check.
5. Scheduled AI skips stale-only stored events by default; use manual/admin refresh for explicit stale enrichment tests.

## 8. Rollback

Fast rollback in Vercel:

1. Open the project in Vercel.
2. Go to `Deployments`.
3. Pick the last known good deployment.
4. Use `Promote to Production`.

Git rollback if needed:

```bash
git log --oneline
git revert <BAD_COMMIT_SHA>
git push origin main
```

## 9. Notes

- Local Express stays available through `npm run dev`.
- Production Vercel uses `/api/v1/...` serverless handlers, not `app.listen()`.
- Do not commit `.env.local`.
- Do not expose `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, or `NEWS_API_KEY` to the frontend.
- Market data is optional and the app works without `MARKET_DATA_API_KEY`.
- If enabled, market data is fetched server-side, cached, and rate-limited before the frontend sees it.
- GNews is optional and the app works without `GNEWS_API_KEY`.
- Recommended live provider mix: `ENABLE_CURRENTS=true`, `ENABLE_GNEWS=true`, `ENABLE_NEWSDATA=true`, `ENABLE_NEWSAPI=true`, with `ENABLE_GDELT` and `ENABLE_RSS` used more sparingly if you want broader but noisier coverage.
- GNews is quota-managed at the provider layer. By default it is live-refresh only, capped per refresh, and historical backfill stays off unless `ENABLE_GNEWS_BACKFILL=true`.
- Historical backfill is manual and admin-only. It is intended as a one-time or occasional maintenance operation, not a scheduled job.
- Historical backfill uses small date windows and skips providers that do not support historical retrieval on the current plan.
- Historical backfill does not call Gemini. It stores rule-based historical event memory and preserves it from normal live-event purge logic.
- Vercel Hobby cron is set to once daily: `0 0 * * *`.
- If you need more frequent automated ingestion later, use Vercel Pro, GitHub Actions scheduled workflows, an external cron service, or the protected `/api/v1/admin/refresh` and `/api/v1/pipeline/run` endpoints.
