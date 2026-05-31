# HellCore Tournament Hub

Clean matchday website for the HellCore 4v4 Ranked Bedwars tournament.

## Run Locally

```bash
npm install
npm start
```

Open `http://localhost:3000`.

The staff panel is hidden at `http://localhost:3000/admin`.

## Environment Variables

- `ADMIN_PASSWORD` - shared staff password.
- `DISCORD_BOT_TOKEN` - Discord bot token used to verify user IDs.
- `DATABASE_URL` - optional Postgres URL for Railway. Without it, the app stores data in `data/state.json`.
- `PGSSLMODE` - use `require` on Railway, or `disable` for local Postgres without SSL.

## Deploy on Railway

1. Create a Railway project.
2. Add a Postgres database.
3. Add `ADMIN_PASSWORD` and `DISCORD_BOT_TOKEN`.
4. Railway should provide `DATABASE_URL`.
5. Deploy this repo with `npm start`.
