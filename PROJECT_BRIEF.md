# HellCore Tournament Hub

## Project Shape

Build a clean, serious, user-friendly website for the HellCore 4v4 RBW Tournament. RBW means Ranked Bedwars. The site is for people who are going to participate in the tournament.

Core line to preserve: "Choose your teammates wisely."

The app should stay flexible enough to edit event details for the next HellCore tournament, without becoming a full multi-event platform yet.

## Public Experience

Sections:

- Overview
- Teams
- Bracket
- Rules
- Register

Players can register a team directly on the site and see other registered teams.

Registration requires:

- Team name
- Exactly 4 players
- Minecraft username for each player
- Discord user ID for each player

Rules:

- Maximum 12 teams
- Teams appear publicly immediately after registering
- Registration automatically closes at 12 teams and shows a clear "Registration full" message
- No substitutes unless announced otherwise
- Teams may be disqualified if a player is unavailable when the match is called

## Staff Panel

Hidden route: `/admin`

Security:

- Simple shared admin password
- `ADMIN_PASSWORD` environment variable

Staff can:

- Edit event details
- Lock/unlock registration
- Edit rules
- Add teams
- Edit teams
- Delete teams
- Generate the bracket
- Pick match winners

## Bracket

Format:

- 4v4
- Maximum 12 teams
- Double elimination
- Every team gets 2 chances

Staff should be able to pick a winner and have the bracket chart advance teams. The bracket also needs manual flexibility because real tournament corrections happen.

## Discord Verification

Use Discord user IDs only.

Integrate lookup behavior directly into our backend, based on the idea from `itsvijaysingh/Discord-Lookup-API`.

Environment variable:

- `DISCORD_BOT_TOKEN`

The public UI should show verified Discord identity cleanly when available.

## Visual Direction

Use the UI/UX design direction:

- Dark mode
- Serious competitive
- User friendly
- Prize emphasis
- HellCore red/white logo colors
- Motion and animation, but no annoying app patterns

The site should feel like a clean competitive matchday hub, not cluttered gamer noise.

Logo asset:

- `public/assets/hellcore-logo.png`

## Tech Direction

Railway-friendly Node app:

- Express backend
- Static frontend served by the same app
- Postgres support through `DATABASE_URL`
- JSON file fallback for local development

Environment variables:

- `ADMIN_PASSWORD`
- `DISCORD_BOT_TOKEN`
- `DATABASE_URL`
- `PGSSLMODE`
