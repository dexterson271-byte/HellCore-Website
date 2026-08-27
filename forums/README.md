# Hellcore Forums (`forums.hellcore.net`)

Standalone production forums for Hellcore Network.

## Stack

- Next.js 15 (App Router) + TypeScript
- PostgreSQL + Prisma
- Shared Hellcore SSO via `hc_token` cookie → `www.hellcore.net/api/auth/me`
- Pusher realtime
- Railway deploy (`Dockerfile` + `railway.toml`)

## Local setup

```bash
cd forums
cp .env.example .env
# set DATABASE_URL to your Postgres
npm install
npx prisma db push
npm run db:seed
npm run dev
```

## Legacy import

```bash
LEGACY_DATABASE_URL="mysql://..." npm run db:migrate-legacy
```

## Railway

1. New service from this repo, root directory `forums`
2. Attach PostgreSQL (`DATABASE_URL`)
3. Set env from `.env.example`
4. Custom domain `forums.hellcore.net`
5. Ensure cookie domain `.hellcore.net` on main site login

## Feature map

| Area | Routes / APIs |
|------|----------------|
| Home / Discover / Categories | `/`, `/discover`, `/forums`, `/c/[slug]` |
| Threads + nested replies | `/t/[id]/[slug]`, `/api/threads*` |
| Reactions / bookmarks / follow | `/api/posts/[id]/reactions`, `/api/threads/[id]/bookmark|follow` |
| Profiles / members / leaderboards | `/u/[username]`, `/members`, `/leaderboards` |
| Notifications / PMs | `/notifications`, `/messages` |
| Moderation / admin | `/admin`, `/api/reports`, `/api/admin/*` |
| SEO | `/sitemap.xml`, `/robots.txt`, OG + JSON-LD on threads |
