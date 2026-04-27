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
ENABLE_GDELT
ENABLE_RSS
ENABLE_NEWSDATA
ENABLE_CURRENTS
ENABLE_NEWSAPI
NEWSDATA_API_KEY
CURRENTS_API_KEY
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
ENABLE_NEWSAPI=true
```

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

## 7. Rollback

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

## 8. Notes

- Local Express stays available through `npm run dev`.
- Production Vercel uses `/api/v1/...` serverless handlers, not `app.listen()`.
- Do not commit `.env.local`.
- Do not expose `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, or `NEWS_API_KEY` to the frontend.
- Market data is optional and the app works without `MARKET_DATA_API_KEY`.
- If enabled, market data is fetched server-side, cached, and rate-limited before the frontend sees it.
- Historical backfill is manual and admin-only. It is intended as a one-time or occasional maintenance operation, not a scheduled job.
- Historical backfill uses small date windows and skips providers that do not support historical retrieval on the current plan.
- Historical backfill does not call Gemini. It stores rule-based historical event memory and preserves it from normal live-event purge logic.
- Vercel Hobby cron is set to once daily: `0 0 * * *`.
- If you need more frequent automated ingestion later, use Vercel Pro, GitHub Actions scheduled workflows, an external cron service, or the protected `/api/v1/admin/refresh` and `/api/v1/pipeline/run` endpoints.
