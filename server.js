const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");
const express = require("express");

const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "hellcore-admin";
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, "data", "state.json");

const defaultState = {
  event: {
    title: "HellCore 4v4 RBW Tournament",
    mode: "Ranked Bedwars",
    dateLabel: "Live today: May 31, 2026",
    maxTeams: 12,
    registrationLocked: false,
    discordUrl: "",
    prizeTitle: "GTA V Account Per Winning Player",
    prizeBody:
      "Each player on the winning team receives 1 GTA V (Epic Games) account, or a game of similar value from the Epic Games Store if possible.",
    rules: [
      "4v4 RBW with 4 players per team.",
      "Maximum 12 teams.",
      "Double elimination: every team gets 2 chances.",
      "Register only if your entire team will be available during the tournament.",
      "If any player is unavailable when your match is called, your team may be disqualified.",
      "No substitutes unless announced otherwise.",
      "Choose your teammates wisely."
    ]
  },
  teams: [],
  bracket: {
    generatedAt: null,
    matches: []
  }
};

class JsonStore {
  async init() {
    await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
    try {
      await fs.access(DATA_FILE);
    } catch {
      await this.write(defaultState);
    }
  }

  async read() {
    const raw = await fs.readFile(DATA_FILE, "utf8");
    return mergeDefaults(JSON.parse(raw));
  }

  async write(state) {
    await fs.writeFile(DATA_FILE, JSON.stringify(state, null, 2));
  }
}

class PostgresStore {
  constructor() {
    const { Pool } = require("pg");
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false }
    });
  }

  async init() {
    await this.pool.query(
      "CREATE TABLE IF NOT EXISTS app_state (id TEXT PRIMARY KEY, data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())"
    );
    const existing = await this.pool.query("SELECT id FROM app_state WHERE id = 'main'");
    if (!existing.rowCount) {
      await this.write(defaultState);
    }
  }

  async read() {
    const result = await this.pool.query("SELECT data FROM app_state WHERE id = 'main'");
    return mergeDefaults(result.rows[0]?.data || defaultState);
  }

  async write(state) {
    await this.pool.query(
      "INSERT INTO app_state (id, data, updated_at) VALUES ('main', $1, NOW()) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()",
      [state]
    );
  }
}

function mergeDefaults(state) {
  return {
    ...defaultState,
    ...state,
    event: { ...defaultState.event, ...(state.event || {}) },
    teams: state.teams || [],
    bracket: { ...defaultState.bracket, ...(state.bracket || {}) }
  };
}

function signToken() {
  const payload = JSON.stringify({ role: "admin", iat: Date.now() });
  const body = Buffer.from(payload).toString("base64url");
  const sig = crypto.createHmac("sha256", ADMIN_PASSWORD).update(body).digest("base64url");
  return `${body}.${sig}`;
}

function signCaptcha(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", ADMIN_PASSWORD).update(`captcha.${body}`).digest("base64url");
  return `${body}.${sig}`;
}

function makeCaptcha() {
  const a = crypto.randomInt(3, 18);
  const b = crypto.randomInt(2, 14);
  return {
    question: `${a} + ${b}`,
    token: signCaptcha({
      answer: a + b,
      exp: Date.now() + 10 * 60 * 1000,
      nonce: crypto.randomUUID()
    })
  };
}

function verifyCaptcha(token, answer) {
  if (!token || !token.includes(".")) return false;
  const [body, sig] = token.split(".");
  const expected = crypto.createHmac("sha256", ADMIN_PASSWORD).update(`captcha.${body}`).digest("base64url");
  if (Buffer.byteLength(sig) !== Buffer.byteLength(expected)) return false;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
  const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  return payload.exp >= Date.now() && Number(answer) === Number(payload.answer);
}

function verifyToken(token) {
  if (!token || !token.includes(".")) return false;
  const [body, sig] = token.split(".");
  const expected = crypto.createHmac("sha256", ADMIN_PASSWORD).update(body).digest("base64url");
  if (Buffer.byteLength(sig) !== Buffer.byteLength(expected)) return false;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
  const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  return payload.role === "admin";
}

function requireAdmin(req, res, next) {
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!verifyToken(token)) return res.status(401).json({ error: "Admin access required." });
  next();
}

function signCaptainToken(team) {
  const body = Buffer.from(JSON.stringify({ teamId: team.id, code: team.captainCode, iat: Date.now() })).toString(
    "base64url"
  );
  const sig = crypto.createHmac("sha256", ADMIN_PASSWORD).update(`captain.${body}`).digest("base64url");
  return `${body}.${sig}`;
}

function verifyCaptainToken(token, state) {
  if (!token || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  const expected = crypto.createHmac("sha256", ADMIN_PASSWORD).update(`captain.${body}`).digest("base64url");
  if (Buffer.byteLength(sig) !== Buffer.byteLength(expected)) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  const team = state.teams.find((item) => item.id === payload.teamId);
  if (!team || team.captainCode !== payload.code) return null;
  return team;
}

function cleanText(value, max = 80) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, max);
}

function makeCaptainCode() {
  return crypto.randomBytes(4).toString("hex").toUpperCase();
}

function normalizeTeam(input) {
  const players = Array.isArray(input.players) ? input.players : [];
  const normalizedPlayers = players.slice(0, 4).map((player) => ({
    id: player.id || crypto.randomUUID(),
    minecraft: cleanText(player.minecraft, 40),
    discordId: cleanText(player.discordId, 30),
    discord: player.discord || null
  }));
  const captainPlayerId =
    normalizedPlayers.find((player) => player.id === input.captainPlayerId)?.id || normalizedPlayers[0]?.id || null;
  return {
    id: input.id || crypto.randomUUID(),
    name: cleanText(input.name, 60),
    createdAt: input.createdAt || new Date().toISOString(),
    captainPlayerId,
    captainCode: input.captainCode || makeCaptainCode(),
    players: normalizedPlayers
  };
}

function validateTeam(team, options = {}) {
  const exactPlayers = options.exactPlayers !== false;
  if (!team.name) return "Team name is required.";
  if (exactPlayers && team.players.length !== 4) return "Exactly 4 players are required.";
  if (!exactPlayers && (team.players.length < 1 || team.players.length > 4)) return "Teams must have 1 to 4 players.";
  if (!team.players.some((player) => player.id === team.captainPlayerId)) return "Captain must be on the team.";
  for (const [index, player] of team.players.entries()) {
    if (!player.minecraft) return `Player ${index + 1} needs a Minecraft username.`;
    if (!/^\d{15,25}$/.test(player.discordId)) return `Player ${index + 1} needs a valid Discord user ID.`;
  }
  return null;
}

function publicTeam(team) {
  return {
    id: team.id,
    name: team.name,
    createdAt: team.createdAt,
    captainPlayerId: team.captainPlayerId,
    players: (team.players || []).map((player) => ({
      id: player.id,
      minecraft: player.minecraft,
      discordId: player.discordId,
      discord: player.discord
    }))
  };
}

function publicState(state) {
  return {
    ...state,
    teams: (state.teams || []).map(publicTeam)
  };
}

async function lookupDiscordUser(id) {
  if (!process.env.DISCORD_BOT_TOKEN) return { id, status: "unconfigured" };
  const response = await fetch(`https://discord.com/api/v10/users/${id}`, {
    headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` }
  });
  if (!response.ok) return { id, status: "not_found" };
  const user = await response.json();
  return {
    id: user.id,
    username: user.global_name || user.username,
    handle: user.discriminator && user.discriminator !== "0" ? `${user.username}#${user.discriminator}` : user.username,
    avatar: user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=64` : null,
    status: "verified"
  };
}

function teamRef(team) {
  return team ? { id: team.id, name: team.name } : null;
}

function makeMatch(id, bracket, round, position, teamA = null, teamB = null, nextWin = null, nextLose = null) {
  return { id, bracket, round, position, teamA, teamB, winner: null, nextWin, nextLose, locked: false };
}

function generateBracket(teams) {
  const seeded = [...teams].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  const slots = Array.from({ length: 12 }, (_, i) => teamRef(seeded[i]));
  const matches = [
    makeMatch("w1", "Winners", 1, 1, slots[4], slots[11], { matchId: "w5", slot: "teamB" }, { matchId: "l1", slot: "teamA" }),
    makeMatch("w2", "Winners", 1, 2, slots[5], slots[10], { matchId: "w8", slot: "teamB" }, { matchId: "l1", slot: "teamB" }),
    makeMatch("w3", "Winners", 1, 3, slots[6], slots[9], { matchId: "w7", slot: "teamB" }, { matchId: "l2", slot: "teamA" }),
    makeMatch("w4", "Winners", 1, 4, slots[7], slots[8], { matchId: "w6", slot: "teamB" }, { matchId: "l2", slot: "teamB" }),
    makeMatch("w5", "Winners", 2, 1, slots[0], null, { matchId: "w9", slot: "teamA" }, { matchId: "l4", slot: "teamB" }),
    makeMatch("w6", "Winners", 2, 2, slots[3], null, { matchId: "w9", slot: "teamB" }, { matchId: "l3", slot: "teamB" }),
    makeMatch("w7", "Winners", 2, 3, slots[2], null, { matchId: "w10", slot: "teamA" }, { matchId: "l3", slot: "teamA" }),
    makeMatch("w8", "Winners", 2, 4, slots[1], null, { matchId: "w10", slot: "teamB" }, { matchId: "l4", slot: "teamA" }),
    makeMatch("w9", "Winners", 3, 1, null, null, { matchId: "w11", slot: "teamA" }, { matchId: "l8", slot: "teamB" }),
    makeMatch("w10", "Winners", 3, 2, null, null, { matchId: "w11", slot: "teamB" }, { matchId: "l7", slot: "teamB" }),
    makeMatch("w11", "Winners", 4, 1, null, null, { matchId: "gf", slot: "teamA" }, { matchId: "l10", slot: "teamB" }),
    makeMatch("l1", "Elimination", 1, 1, null, null, { matchId: "l3", slot: "teamB" }, null),
    makeMatch("l2", "Elimination", 1, 2, null, null, { matchId: "l4", slot: "teamB" }, null),
    makeMatch("l3", "Elimination", 2, 1, null, null, { matchId: "l5", slot: "teamA" }, null),
    makeMatch("l4", "Elimination", 2, 2, null, null, { matchId: "l6", slot: "teamA" }, null),
    makeMatch("l5", "Elimination", 3, 1, null, null, { matchId: "l7", slot: "teamA" }, null),
    makeMatch("l6", "Elimination", 3, 2, null, null, { matchId: "l8", slot: "teamA" }, null),
    makeMatch("l7", "Elimination", 4, 1, null, null, { matchId: "l9", slot: "teamA" }, null),
    makeMatch("l8", "Elimination", 4, 2, null, null, { matchId: "l9", slot: "teamB" }, null),
    makeMatch("l9", "Elimination", 5, 1, null, null, { matchId: "l10", slot: "teamA" }, null),
    makeMatch("l10", "Elimination", 6, 1, null, null, { matchId: "gf", slot: "teamB" }, null),
    makeMatch("gf", "Grand Final", 1, 1, null, null, null, null)
  ];
  autoAdvanceByes(matches);
  return { generatedAt: new Date().toISOString(), matches };
}

function autoAdvanceByes(matches) {
  let changed = true;
  while (changed) {
    changed = false;
    for (const match of matches) {
      if (match.winner || match.locked) continue;
      const only = match.teamA && !match.teamB ? match.teamA : match.teamB && !match.teamA ? match.teamB : null;
      if (only && match.nextWin) {
        placeTeam(matches, match.nextWin, only);
        match.winner = only.id;
        match.locked = true;
        changed = true;
      }
    }
  }
}

function placeTeam(matches, target, team) {
  const next = matches.find((match) => match.id === target.matchId);
  if (next) next[target.slot] = team;
}

function setWinner(bracket, matchId, winnerId) {
  const matches = bracket.matches;
  const match = matches.find((item) => item.id === matchId);
  if (!match) throw new Error("Match not found.");
  const winner = [match.teamA, match.teamB].find((team) => team?.id === winnerId);
  const loser = [match.teamA, match.teamB].find((team) => team && team.id !== winnerId);
  if (!winner) throw new Error("Winner must be in the selected match.");
  match.winner = winner.id;
  match.locked = false;
  if (match.nextWin) placeTeam(matches, match.nextWin, winner);
  if (match.nextLose && loser) placeTeam(matches, match.nextLose, loser);
  autoAdvanceByes(matches);
}

async function main() {
  const store = process.env.DATABASE_URL ? new PostgresStore() : new JsonStore();
  await store.init();

  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use(express.static(path.join(__dirname, "public")));

  app.get("/api/state", async (_req, res) => {
    const state = await store.read();
    res.json(publicState(state));
  });

  app.get("/api/captcha", (_req, res) => {
    res.json(makeCaptcha());
  });

  app.post("/api/admin/login", (req, res) => {
    if (req.body.password !== ADMIN_PASSWORD) return res.status(401).json({ error: "Wrong password." });
    res.json({ token: signToken() });
  });

  app.put("/api/admin/event", requireAdmin, async (req, res) => {
    const state = await store.read();
    state.event = { ...state.event, ...req.body };
    await store.write(state);
    res.json(state.event);
  });

  app.post("/api/teams", async (req, res) => {
    const state = await store.read();
    if (state.event.registrationLocked || state.teams.length >= state.event.maxTeams) {
      return res.status(409).json({ error: "Registration full." });
    }
    if (req.body.website) return res.status(400).json({ error: "Registration could not be verified." });
    if (!verifyCaptcha(req.body.captchaToken, req.body.captchaAnswer)) {
      return res.status(400).json({ error: "Captcha answer is incorrect or expired." });
    }
    const team = normalizeTeam(req.body);
    const error = validateTeam(team);
    if (error) return res.status(400).json({ error });
    team.players = await Promise.all(
      team.players.map(async (player) => ({ ...player, discord: await lookupDiscordUser(player.discordId) }))
    );
    state.teams.push(team);
    state.bracket = { generatedAt: null, matches: [] };
    await store.write(state);
    res.status(201).json({ team: publicTeam(team), captainCode: team.captainCode });
  });

  app.post("/api/captain/login", async (req, res) => {
    const state = await store.read();
    const team = state.teams.find((item) => item.id === req.body.teamId);
    if (!team || cleanText(req.body.captainCode, 20).toUpperCase() !== team.captainCode) {
      return res.status(401).json({ error: "Team or captain code is incorrect." });
    }
    res.json({ token: signCaptainToken(team), team: publicTeam(team) });
  });

  app.get("/api/captain/team", async (req, res) => {
    const state = await store.read();
    const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    const team = verifyCaptainToken(token, state);
    if (!team) return res.status(401).json({ error: "Captain access required." });
    res.json(publicTeam(team));
  });

  app.put("/api/captain/team", async (req, res) => {
    const state = await store.read();
    const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    const existing = verifyCaptainToken(token, state);
    if (!existing) return res.status(401).json({ error: "Captain access required." });
    const index = state.teams.findIndex((team) => team.id === existing.id);
    const team = normalizeTeam({
      ...existing,
      players: req.body.players,
      captainPlayerId: req.body.captainPlayerId,
      id: existing.id,
      name: existing.name,
      createdAt: existing.createdAt,
      captainCode: existing.captainCode
    });
    const error = validateTeam(team, { exactPlayers: false });
    if (error) return res.status(400).json({ error });
    team.players = await Promise.all(
      team.players.map(async (player) => ({ ...player, discord: await lookupDiscordUser(player.discordId) }))
    );
    state.teams[index] = team;
    state.bracket = { generatedAt: null, matches: [] };
    await store.write(state);
    res.json(publicTeam(team));
  });

  app.post("/api/admin/teams", requireAdmin, async (req, res) => {
    const state = await store.read();
    const team = normalizeTeam(req.body);
    const error = validateTeam(team);
    if (error) return res.status(400).json({ error });
    team.players = await Promise.all(
      team.players.map(async (player) => ({ ...player, discord: await lookupDiscordUser(player.discordId) }))
    );
    state.teams.push(team);
    state.bracket = { generatedAt: null, matches: [] };
    await store.write(state);
    res.status(201).json(team);
  });

  app.put("/api/admin/teams/:id", requireAdmin, async (req, res) => {
    const state = await store.read();
    const index = state.teams.findIndex((team) => team.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: "Team not found." });
    const team = normalizeTeam({
      ...req.body,
      id: req.params.id,
      createdAt: state.teams[index].createdAt,
      captainCode: state.teams[index].captainCode
    });
    const error = validateTeam(team);
    if (error) return res.status(400).json({ error });
    team.players = await Promise.all(
      team.players.map(async (player) => ({ ...player, discord: await lookupDiscordUser(player.discordId) }))
    );
    state.teams[index] = team;
    state.bracket = { generatedAt: null, matches: [] };
    await store.write(state);
    res.json(team);
  });

  app.delete("/api/admin/teams/:id", requireAdmin, async (req, res) => {
    const state = await store.read();
    state.teams = state.teams.filter((team) => team.id !== req.params.id);
    state.bracket = { generatedAt: null, matches: [] };
    await store.write(state);
    res.status(204).end();
  });

  app.post("/api/admin/bracket/generate", requireAdmin, async (_req, res) => {
    const state = await store.read();
    state.bracket = generateBracket(state.teams);
    await store.write(state);
    res.json(state.bracket);
  });

  app.post("/api/admin/bracket/:matchId/winner", requireAdmin, async (req, res) => {
    const state = await store.read();
    if (!state.bracket.matches.length) state.bracket = generateBracket(state.teams);
    try {
      setWinner(state.bracket, req.params.matchId, req.body.winnerId);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
    await store.write(state);
    res.json(state.bracket);
  });

  app.put("/api/admin/bracket/matches/:matchId", requireAdmin, async (req, res) => {
    const state = await store.read();
    const match = state.bracket.matches.find((item) => item.id === req.params.matchId);
    if (!match) return res.status(404).json({ error: "Match not found." });
    Object.assign(match, req.body);
    await store.write(state);
    res.json(match);
  });

  app.get("/admin", (_req, res) => {
    res.sendFile(path.join(__dirname, "public", "admin.html"));
  });

  app.get("/teams", (_req, res) => {
    res.sendFile(path.join(__dirname, "public", "teams.html"));
  });

  app.get("/bracket", (_req, res) => {
    res.sendFile(path.join(__dirname, "public", "bracket.html"));
  });

  app.get("/rules", (_req, res) => {
    res.sendFile(path.join(__dirname, "public", "rules.html"));
  });

  app.get("/register", (_req, res) => {
    res.sendFile(path.join(__dirname, "public", "register.html"));
  });

  app.get("/captain", (_req, res) => {
    res.sendFile(path.join(__dirname, "public", "captain.html"));
  });

  app.get("*", (_req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
  });

  app.listen(PORT, () => {
    console.log(`HellCore hub running on http://localhost:${PORT}`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
