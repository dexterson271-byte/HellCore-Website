const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { MongoClient } = require("mongodb");
const crypto = require("crypto");

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 5000);
const MONGODB_URL = process.env.MONGODB_URL || "mongodb://localhost:27017";
const DIRECT_MONGODB_URL = process.env.DIRECT_MONGODB_URL || "";
const DB_NAME = process.env.DB_NAME || "minecraft_stats";
const COLLECTION_NAME = process.env.COLLECTION_NAME || "players";
const REALTIME_DB_NAME = process.env.REALTIME_DB_NAME || "stats";
const REALTIME_COLLECTION_NAME = process.env.REALTIME_COLLECTION_NAME || "stats";
const REALTIME_DOCUMENT_ID = process.env.REALTIME_DOCUMENT_ID || "players";
const CACHE_TTL_MS = Number(process.env.CACHE_TTL_MS || 60_000);

const SORT_FIELDS = new Set([
  "rank",
  "current_win_streak",
  "top_win_streak",
  "won",
  "lost",
  "rounds_played",
  "w_l",
  "kills",
  "top_kill_streak",
  "final_kills",
  "deaths",
  "final_deaths",
  "k_d",
  "final_k_d",
  "beds_destroyed",
  "updated"
]);

const samplePlayers = [
  {
    username: "KqTF",
    rank: 1,
    current_win_streak: 25,
    top_win_streak: 40,
    won: 1536,
    lost: 630,
    rounds_played: 2050,
    w_l: 3.72,
    kills: 8538,
    top_kill_streak: 56,
    final_kills: 4244,
    deaths: 5794,
    final_deaths: 447,
    k_d: 1.47,
    final_k_d: 9.49,
    beds_destroyed: 1693,
    time_played: "7d 13h 57m 21s",
    updated: 1775037200617
  },
  {
    username: "Technoblade",
    rank: 2,
    current_win_streak: 100,
    top_win_streak: 1400,
    won: 15000,
    lost: 500,
    rounds_played: 15500,
    w_l: 30,
    kills: 50000,
    top_kill_streak: 200,
    final_kills: 25000,
    deaths: 2000,
    final_deaths: 100,
    k_d: 25,
    final_k_d: 250,
    beds_destroyed: 10000,
    time_played: "50d 10h 20m 10s",
    updated: 1775037200617
  },
  {
    username: "Dream",
    rank: 3,
    current_win_streak: 10,
    top_win_streak: 50,
    won: 5000,
    lost: 1200,
    rounds_played: 6200,
    w_l: 4.16,
    kills: 15000,
    top_kill_streak: 80,
    final_kills: 8000,
    deaths: 4000,
    final_deaths: 800,
    k_d: 3.75,
    final_k_d: 10,
    beds_destroyed: 4500,
    time_played: "20d 5h 15m 30s",
    updated: 1775037200617
  }
];

app.use(cors());
app.use(express.json());

let mongoClient = null;
let playersCollection = null;
let realtimeCollection = null;
let analyticsCollection = null;
const responseCache = new Map();
let memoryVisitors = new Set();

function rgbArrayToCss(rgb) {
  if (!Array.isArray(rgb) || rgb.length !== 3) {
    return null;
  }

  const [r, g, b] = rgb.map((value) => Number(value ?? 255));
  return `rgb(${r}, ${g}, ${b})`;
}

function resolveLevelColor(level) {
  if (level >= 100) return "#f43f5e";
  if (level >= 75) return "#f59e0b";
  if (level >= 50) return "#a855f7";
  if (level >= 25) return "#22d3ee";
  if (level >= 10) return "#34d399";
  return "#e2e8f0";
}

function getXpBreakdown(player) {
  const xp =
    Number(player.final_kills ?? 0) * 25 +
    Number(player.beds_destroyed ?? 0) * 25 +
    Number(player.kills ?? 0) * 3 +
    Number(player.won ?? 0) * 25 +
    Number(player.rounds_played ?? 0);

  const level = Math.floor(xp / 2500);
  const progress = xp % 2500;

  return {
    xp,
    level,
    progress,
    nextLevelAt: 2500,
    remaining: 2500 - progress
  };
}

function resolveCustomRank(username, customRanksDoc) {
  if (!customRanksDoc) {
    return {
      name: null,
      color: null
    };
  }

  const matchedRankKey = Object.keys(customRanksDoc).find(
    (key) => key.toLowerCase() === username.toLowerCase()
  );

  const rankName = matchedRankKey ? customRanksDoc[matchedRankKey] : null;
  const rankColor = rankName ? rgbArrayToCss(customRanksDoc[rankName]) : null;

  return {
    name: rankName,
    color: rankColor
  };
}

function normalizePlayer(player) {
  if (!player) {
    return null;
  }

  const { _id, ...rest } = player;
  return {
    id: _id ? String(_id) : undefined,
    ...rest
  };
}

function normalizeRealtimePlayer(username, player, customRanksDoc) {
  if (!player) {
    return null;
  }

  const xp = getXpBreakdown(player);
  const customRank = resolveCustomRank(username, customRanksDoc);

  return {
    username,
    rank: Number(player.rank ?? 0),
    current_win_streak: Number(player.current_win_streak ?? 0),
    top_win_streak: Number(player.top_win_streak ?? 0),
    won: Number(player.won ?? 0),
    lost: Number(player.lost ?? 0),
    rounds_played: Number(player.rounds_played ?? 0),
    w_l: Number(player.w_l ?? 0),
    kills: Number(player.kills ?? 0),
    top_kill_streak: Number(player.top_kill_streak ?? 0),
    final_kills: Number(player.final_kills ?? 0),
    deaths: Number(player.deaths ?? 0),
    final_deaths: Number(player.final_deaths ?? 0),
    k_d: Number(player.k_d ?? 0),
    final_k_d: Number(player.final_k_d ?? 0),
    beds_destroyed: Number(player.beds_destroyed ?? 0),
    time_played: player.time_played ?? "0s",
    updated: Number(player.updated ?? 0),
    custom_rank: customRank.name,
    custom_rank_color: customRank.color,
    stars: xp.level,
    level: xp.level,
    xp: xp.xp,
    xp_progress: xp.progress,
    xp_to_next_level: xp.nextLevelAt,
    xp_remaining: xp.remaining,
    level_color: resolveLevelColor(xp.level)
  };
}

async function getRealtimeDocument(documentId) {
  if (!realtimeCollection) {
    return null;
  }

  const cacheKey = `doc:${documentId}`;
  const cached = getCached(cacheKey);
  if (cached) {
    return cached;
  }

  const doc = await realtimeCollection.findOne({ _id: documentId });
  if (doc) {
    setCached(cacheKey, doc);
  }

  return doc;
}

function getCached(key) {
  const cached = responseCache.get(key);
  if (!cached) {
    return null;
  }

  if (Date.now() > cached.expiresAt) {
    responseCache.delete(key);
    return null;
  }

  return cached.value;
}

function setCached(key, value) {
  responseCache.set(key, {
    value,
    expiresAt: Date.now() + CACHE_TTL_MS
  });
}

async function connectToMongo() {
  const connectionCandidates = [MONGODB_URL, DIRECT_MONGODB_URL].filter(Boolean);

  let lastError = null;

  for (const connectionString of connectionCandidates) {
    try {
      mongoClient = new MongoClient(connectionString);
      await mongoClient.connect();

      const db = mongoClient.db(DB_NAME);
      playersCollection = db.collection(COLLECTION_NAME);
      realtimeCollection = mongoClient
        .db(REALTIME_DB_NAME)
        .collection(REALTIME_COLLECTION_NAME);
      analyticsCollection = mongoClient
        .db(REALTIME_DB_NAME)
        .collection("site_visitors");

      await playersCollection.createIndex({ username: 1 }, { unique: true });

      const count = await playersCollection.countDocuments();
      if (count === 0) {
        await playersCollection.insertMany(samplePlayers);
      }

      console.log(`Connected to MongoDB database "${DB_NAME}"`);
      return;
    } catch (error) {
      lastError = error;
      playersCollection = null;
      analyticsCollection = null;

      if (mongoClient) {
        try {
          await mongoClient.close();
        } catch (_closeError) {
          // Ignore close errors while trying the next connection string.
        }
      }
    }
  }

  try {
    console.warn("MongoDB connection failed. Falling back to in-memory sample data.");
    console.warn(lastError?.message || "Unknown MongoDB error");
    playersCollection = null;
  } catch (_error) {
    playersCollection = null;
    analyticsCollection = null;
  }
}

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  const rawIp = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(",")[0];
  return (rawIp || req.ip || req.socket?.remoteAddress || "unknown").trim();
}

function hashVisitor(ip) {
  return crypto.createHash("sha256").update(ip).digest("hex");
}

async function getVisitorStats() {
  const cacheKey = "site:stats";
  const cached = getCached(cacheKey);
  if (cached) {
    return cached;
  }

  let stats;

  if (analyticsCollection) {
    const uniqueVisitors = await analyticsCollection.countDocuments();
    const aggregate = await analyticsCollection.aggregate([
      {
        $group: {
          _id: null,
          totalVisits: { $sum: "$visits" }
        }
      }
    ]).toArray();

    stats = {
      uniqueVisitors,
      totalVisits: aggregate[0]?.totalVisits ?? uniqueVisitors
    };
  } else {
    stats = {
      uniqueVisitors: memoryVisitors.size,
      totalVisits: memoryVisitors.size
    };
  }

  setCached(cacheKey, stats);
  return stats;
}

async function registerVisit(req) {
  const ip = getClientIp(req);
  const visitorId = hashVisitor(ip);

  if (analyticsCollection) {
    await analyticsCollection.updateOne(
      { _id: visitorId },
      {
        $setOnInsert: {
          firstSeenAt: new Date()
        },
        $set: {
          lastSeenAt: new Date()
        },
        $inc: {
          visits: 1
        }
      },
      { upsert: true }
    );
  } else {
    memoryVisitors.add(visitorId);
  }

  responseCache.delete("site:stats");
  return getVisitorStats();
}

async function getPlayerByUsername(username) {
  const cacheKey = `player:${username.toLowerCase()}`;
  const cached = getCached(cacheKey);
  if (cached) {
    return cached;
  }

  let player = null;

  if (realtimeCollection) {
    const [playersDoc, customRanksDoc] = await Promise.all([
      getRealtimeDocument(REALTIME_DOCUMENT_ID),
      getRealtimeDocument("custom_ranks")
    ]);

    if (playersDoc) {
      const matchedEntry = Object.entries(playersDoc).find(([key]) => key.toLowerCase() === username.toLowerCase());
      if (matchedEntry) {
        const [matchedUsername, stats] = matchedEntry;
        player = normalizeRealtimePlayer(matchedUsername, stats, customRanksDoc);
      }
    }
  }

  if (!player && playersCollection) {
    const dbPlayer = await playersCollection.findOne({
      username: { $regex: `^${username}$`, $options: "i" }
    });
    player = normalizePlayer(dbPlayer);
  } else {
    player = player || samplePlayers.find(
      (entry) => entry.username.toLowerCase() === username.toLowerCase()
    );
  }

  const normalized = player && player.username ? player : normalizePlayer(player);
  if (normalized) {
    setCached(cacheKey, normalized);
  }

  return normalized;
}

async function getLeaderboard(limit, sortBy) {
  const cacheKey = `leaderboard:${limit}:${sortBy}`;
  const cached = getCached(cacheKey);
  if (cached) {
    return cached;
  }

  let players;

  if (realtimeCollection) {
    const [playersDoc, customRanksDoc] = await Promise.all([
      getRealtimeDocument(REALTIME_DOCUMENT_ID),
      getRealtimeDocument("custom_ranks")
    ]);
    if (playersDoc) {
      players = Object.entries(playersDoc)
        .filter(([key, value]) => key !== "_id" && value && typeof value === "object")
        .map(([username, value]) => normalizeRealtimePlayer(username, value, customRanksDoc))
        .sort((a, b) => {
          const primary = (b[sortBy] || 0) - (a[sortBy] || 0);
          if (primary !== 0) {
            return primary;
          }
          return a.username.localeCompare(b.username);
        })
        .slice(0, limit);
    }
  }

  if (!players && playersCollection) {
    players = (await playersCollection
      .find({})
      .sort({ [sortBy]: -1, username: 1 })
      .limit(limit)
      .toArray()).map(normalizePlayer);
  } else {
    players = players || [...samplePlayers]
      .sort((a, b) => {
        const primary = (b[sortBy] || 0) - (a[sortBy] || 0);
        if (primary !== 0) {
          return primary;
        }
        return a.username.localeCompare(b.username);
      })
      .slice(0, limit);
  }

  const normalized = players.map((player) =>
    player && player.username ? player : normalizePlayer(player)
  );
  setCached(cacheKey, normalized);
  return normalized;
}

async function searchPlayers(query, limit) {
  const safeLimit = Math.min(Math.max(limit, 1), 8);
  const cacheKey = `search:${query.toLowerCase()}:${safeLimit}`;
  const cached = getCached(cacheKey);
  if (cached) {
    return cached;
  }

  let results;

  if (realtimeCollection) {
    const [playersDoc, customRanksDoc] = await Promise.all([
      getRealtimeDocument(REALTIME_DOCUMENT_ID),
      getRealtimeDocument("custom_ranks")
    ]);
    if (playersDoc) {
      results = Object.entries(playersDoc)
        .filter(([key, value]) => key !== "_id" && value && typeof value === "object")
        .filter(([username]) => username.toLowerCase().includes(query.toLowerCase()))
        .map(([username, value]) => normalizeRealtimePlayer(username, value, customRanksDoc))
        .sort((a, b) => {
          const primary = b.won - a.won;
          if (primary !== 0) {
            return primary;
          }
          return a.username.localeCompare(b.username);
        })
        .slice(0, safeLimit)
        .map(({ username, rank, won, final_k_d, custom_rank, custom_rank_color, stars, level_color }) => ({
          username,
          rank,
          won,
          final_k_d,
          custom_rank,
          custom_rank_color,
          stars,
          level_color
        }));
    }
  }

  if (!results && playersCollection) {
    results = (await playersCollection
      .find({ username: { $regex: query, $options: "i" } })
      .sort({ won: -1, username: 1 })
      .limit(safeLimit)
      .project({
        username: 1,
        rank: 1,
        won: 1,
        final_k_d: 1
      })
      .toArray()).map(normalizePlayer);
  } else {
    results = results || samplePlayers
      .filter((entry) => entry.username.toLowerCase().includes(query.toLowerCase()))
      .slice(0, safeLimit);
  }

  const normalized = results.map((player) =>
    player && player.username ? player : normalizePlayer(player)
  );
  setCached(cacheKey, normalized);
  return normalized;
}

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    database: playersCollection ? "mongodb" : "memory"
  });
});

app.get("/api/site-stats", async (_req, res) => {
  try {
    const stats = await getVisitorStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ message: "Failed to load site stats" });
  }
});

app.post("/api/visit", async (req, res) => {
  try {
    const stats = await registerVisit(req);
    res.json(stats);
  } catch (error) {
    res.status(500).json({ message: "Failed to record visit" });
  }
});

app.get("/api/player/:username", async (req, res) => {
  try {
    const player = await getPlayerByUsername(req.params.username);
    if (!player) {
      return res.status(404).json({ message: "Player not found" });
    }

    res.json(player);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch player stats" });
  }
});

app.get("/api/compare", async (req, res) => {
  const player1Name = req.query.player1 || req.query.p1;
  const player2Name = req.query.player2 || req.query.p2;

  if (!player1Name || !player2Name) {
    return res.status(400).json({
      message: "Both player1 and player2 are required"
    });
  }

  try {
    const [player1, player2] = await Promise.all([
      getPlayerByUsername(player1Name),
      getPlayerByUsername(player2Name)
    ]);

    const missing = [player1 ? null : player1Name, player2 ? null : player2Name].filter(Boolean);
    if (missing.length) {
      return res.status(404).json({
        message: `Player not found: ${missing.join(", ")}`
      });
    }

    res.json({ player1, player2 });
  } catch (error) {
    res.status(500).json({ message: "Failed to compare players" });
  }
});

app.get("/api/leaderboard", async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 50);
  const sortBy = String(req.query.sort_by || "won");

  if (!SORT_FIELDS.has(sortBy)) {
    return res.status(400).json({ message: "Invalid sort field" });
  }

  try {
    const players = await getLeaderboard(limit, sortBy);
    res.json(players);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch leaderboard" });
  }
});

app.get("/api/search", async (req, res) => {
  const query = String(req.query.q || "").trim();
  const limit = Number(req.query.limit) || 5;

  if (!query) {
    return res.json([]);
  }

  try {
    const results = await searchPlayers(query, limit);
    res.json(results);
  } catch (error) {
    res.status(500).json({ message: "Failed to search players" });
  }
});

connectToMongo().finally(() => {
  app.listen(PORT, () => {
    console.log(`Minecraft stats API listening on http://localhost:${PORT}`);
  });
});
