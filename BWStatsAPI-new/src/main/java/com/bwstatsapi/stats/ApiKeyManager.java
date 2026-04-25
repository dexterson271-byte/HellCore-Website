package com.bwstatsapi.stats;

import com.bwstatsapi.BWStatsAPI;

import java.io.File;
import java.security.SecureRandom;
import java.sql.*;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.logging.Level;

public class ApiKeyManager {

    private static final SecureRandom RNG = new SecureRandom();
    private static final int AUTO_BAN_THRESHOLD = 10; // consecutive rate limit hits

    private final BWStatsAPI plugin;
    private Connection conn;

    private final ConcurrentHashMap<String, UUID> keyToUuid    = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<UUID, String> uuidToKey    = new ConcurrentHashMap<>();
    private final Set<UUID>                       bannedUuids  = ConcurrentHashMap.newKeySet();
    private final ConcurrentHashMap<String, Integer> rateLimitHits = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<UUID, Integer> rateLimitOverrideCache = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<UUID, Long>    createdAtCache         = new ConcurrentHashMap<>();

    public ApiKeyManager(BWStatsAPI plugin) { this.plugin = plugin; }

    public boolean init() {
        try {
            File dbFile = new File(plugin.getDataFolder(), "keys.db");
            plugin.getDataFolder().mkdirs();
            conn = DriverManager.getConnection(
                "jdbc:sqlite:" + dbFile.getAbsolutePath()
                    + "?journal_mode=WAL&busy_timeout=5000&synchronous=NORMAL");

            try (Statement st = conn.createStatement()) {
                st.execute("CREATE TABLE IF NOT EXISTS api_keys (" +
                    "uuid TEXT PRIMARY KEY, api_key TEXT NOT NULL UNIQUE," +
                    "created_at INTEGER NOT NULL, rate_limit INTEGER NOT NULL DEFAULT -1," +
                    "banned INTEGER NOT NULL DEFAULT 0)");
                st.execute("CREATE TABLE IF NOT EXISTS rate_limits (" +
                    "api_key TEXT PRIMARY KEY, requests INTEGER NOT NULL DEFAULT 0," +
                    "window INTEGER NOT NULL DEFAULT 0, total INTEGER NOT NULL DEFAULT 0," +
                    "last_used INTEGER NOT NULL DEFAULT 0)");
                for (String col : new String[]{
                    "ALTER TABLE api_keys ADD COLUMN rate_limit INTEGER NOT NULL DEFAULT -1",
                    "ALTER TABLE api_keys ADD COLUMN banned INTEGER NOT NULL DEFAULT 0",
                    "ALTER TABLE rate_limits ADD COLUMN total INTEGER NOT NULL DEFAULT 0",
                    "ALTER TABLE rate_limits ADD COLUMN last_used INTEGER NOT NULL DEFAULT 0"
                }) { try { st.execute(col); } catch (SQLException ignored) {} }
            }

            try (ResultSet rs = conn.createStatement().executeQuery(
                    "SELECT uuid, api_key, banned, created_at, rate_limit FROM api_keys")) {
                while (rs.next()) {
                    UUID uuid = UUID.fromString(rs.getString("uuid"));
                    String key = rs.getString("api_key");
                    keyToUuid.put(key, uuid);
                    uuidToKey.put(uuid, key);
                    if (rs.getInt("banned") == 1) bannedUuids.add(uuid);
                    createdAtCache.put(uuid, rs.getLong("created_at"));
                    rateLimitOverrideCache.put(uuid, rs.getInt("rate_limit"));
                }
            }

            plugin.getLogger().info("ApiKeyManager: loaded " + keyToUuid.size() + " key(s).");
            return true;
        } catch (SQLException e) {
            plugin.getLogger().log(Level.SEVERE, "Failed to init SQLite database", e);
            return false;
        }
    }

    public void close() {
        try { if (conn != null && !conn.isClosed()) conn.close(); } catch (SQLException ignored) {}
    }

    // ── Key operations ─────────────────────────────────────────────────────

    public String createKey(UUID uuid) throws SQLException {
        String key = generateKey();
        synchronized (conn) {
            try (PreparedStatement ps = conn.prepareStatement(
                    "INSERT INTO api_keys (uuid, api_key, created_at, rate_limit, banned) VALUES (?,?,?,-1,0)")) {
                ps.setString(1, uuid.toString()); ps.setString(2, key);
                ps.setLong(3, System.currentTimeMillis() / 1000L); ps.executeUpdate();
            }
        }
        keyToUuid.put(key, uuid); uuidToKey.put(uuid, key);
        return key;
    }

    public boolean revokeKey(UUID uuid) throws SQLException {
        String key = uuidToKey.remove(uuid);
        if (key == null) return false;
        keyToUuid.remove(key); bannedUuids.remove(uuid); rateLimitHits.remove(key);
        synchronized (conn) {
            try (PreparedStatement ps = conn.prepareStatement("DELETE FROM api_keys WHERE uuid = ?")) {
                ps.setString(1, uuid.toString()); ps.executeUpdate();
            }
            try (PreparedStatement ps = conn.prepareStatement("DELETE FROM rate_limits WHERE api_key = ?")) {
                ps.setString(1, key); ps.executeUpdate();
            }
        }
        return true;
    }

    public void setBanned(UUID uuid, boolean banned) throws SQLException {
        if (!uuidToKey.containsKey(uuid)) return;
        if (banned) bannedUuids.add(uuid); else bannedUuids.remove(uuid);
        synchronized (conn) {
            try (PreparedStatement ps = conn.prepareStatement(
                    "UPDATE api_keys SET banned = ? WHERE uuid = ?")) {
                ps.setInt(1, banned ? 1 : 0); ps.setString(2, uuid.toString()); ps.executeUpdate();
            }
        }
    }

    public boolean isBanned(UUID uuid)  { return bannedUuids.contains(uuid); }
    public int getBannedCount()         { return bannedUuids.size(); }

    public void setRateLimit(UUID uuid, int limit) throws SQLException {
        if (!uuidToKey.containsKey(uuid)) return;
        synchronized (conn) {
            try (PreparedStatement ps = conn.prepareStatement(
                    "UPDATE api_keys SET rate_limit = ? WHERE uuid = ?")) {
                ps.setInt(1, limit); ps.setString(2, uuid.toString()); ps.executeUpdate();
            }
        }
        rateLimitOverrideCache.put(uuid, limit);
    }

    public int getRateLimit(UUID uuid) {
        if (!uuidToKey.containsKey(uuid)) return -1;
        Integer cached = rateLimitOverrideCache.get(uuid);
        if (cached != null) return cached;
        String key = uuidToKey.get(uuid); if (key == null) return -1;
        synchronized (conn) {
            try (PreparedStatement ps = conn.prepareStatement(
                    "SELECT rate_limit FROM api_keys WHERE api_key = ?")) {
                ps.setString(1, key);
                try (ResultSet rs = ps.executeQuery()) {
                    if (rs.next()) {
                        int v = rs.getInt("rate_limit");
                        rateLimitOverrideCache.put(uuid, v);
                        return v;
                    }
                }
            } catch (SQLException ignored) {}
        }
        return -1;
    }

    public UUID getOwner(String apiKey)  { return keyToUuid.get(apiKey); }
    public String getKey(UUID uuid)      { return uuidToKey.get(uuid); }
    public boolean hasKey(UUID uuid)     { return uuidToKey.containsKey(uuid); }
    public Set<UUID> getAllKeyOwners()   { return Collections.unmodifiableSet(uuidToKey.keySet()); }

    public Map<UUID, long[]> loadAllUsageSnapshot() {
        Map<String, UUID> keyOwners = new HashMap<>();
        for (Map.Entry<UUID, String> e : uuidToKey.entrySet()) keyOwners.put(e.getValue(), e.getKey());
        Map<UUID, long[]> out = new HashMap<>();
        synchronized (conn) {
            try (Statement st = conn.createStatement();
                 ResultSet rs = st.executeQuery(
                     "SELECT api_key, total, last_used FROM rate_limits")) {
                while (rs.next()) {
                    UUID owner = keyOwners.get(rs.getString("api_key"));
                    if (owner == null) continue;
                    out.put(owner, new long[]{ rs.getLong("total"), rs.getLong("last_used") });
                }
            } catch (SQLException ignored) {}
        }
        for (UUID owner : uuidToKey.keySet()) out.putIfAbsent(owner, new long[]{0L, 0L});
        return out;
    }

    public long getCreatedAt(UUID uuid) {
        Long cached = createdAtCache.get(uuid);
        if (cached != null) return cached;
        String key = uuidToKey.get(uuid); if (key == null) return 0;
        synchronized (conn) {
            try (PreparedStatement ps = conn.prepareStatement(
                    "SELECT created_at FROM api_keys WHERE api_key = ?")) {
                ps.setString(1, key);
                try (ResultSet rs = ps.executeQuery()) {
                    if (rs.next()) {
                        long v = rs.getLong("created_at");
                        createdAtCache.put(uuid, v);
                        return v;
                    }
                }
            } catch (SQLException ignored) {}
        }
        return 0;
    }

    public long getTotalRequests(UUID uuid) {
        String key = uuidToKey.get(uuid); if (key == null) return 0;
        synchronized (conn) {
            try (PreparedStatement ps = conn.prepareStatement(
                    "SELECT total FROM rate_limits WHERE api_key = ?")) {
                ps.setString(1, key);
                try (ResultSet rs = ps.executeQuery()) { if (rs.next()) return rs.getLong("total"); }
            } catch (SQLException ignored) {}
        }
        return 0;
    }

    public long getTotalRequestsAllKeys() {
        synchronized (conn) {
            try (Statement st = conn.createStatement();
                 ResultSet rs = st.executeQuery("SELECT SUM(total) as t FROM rate_limits")) {
                if (rs.next()) return rs.getLong("t");
            } catch (SQLException ignored) {}
        }
        return 0;
    }

    public long getLastUsed(UUID uuid) {
        String key = uuidToKey.get(uuid); if (key == null) return 0;
        synchronized (conn) {
            try (PreparedStatement ps = conn.prepareStatement(
                    "SELECT last_used FROM rate_limits WHERE api_key = ?")) {
                ps.setString(1, key);
                try (ResultSet rs = ps.executeQuery()) { if (rs.next()) return rs.getLong("last_used"); }
            } catch (SQLException ignored) {}
        }
        return 0;
    }

    public int getRequestsThisMinute(String apiKey) {
        long nowWindow = System.currentTimeMillis() / 1000L / 60L;
        synchronized (conn) {
            try (PreparedStatement ps = conn.prepareStatement(
                    "SELECT requests, window FROM rate_limits WHERE api_key = ?")) {
                ps.setString(1, apiKey);
                try (ResultSet rs = ps.executeQuery()) {
                    if (rs.next() && rs.getLong("window") == nowWindow) return rs.getInt("requests");
                }
            } catch (SQLException ignored) {}
        }
        return 0;
    }

    // ── Rate limiting with auto-ban ────────────────────────────────────────

    public boolean isAllowed(String apiKey) {
        UUID owner = keyToUuid.get(apiKey);
        if (owner != null && bannedUuids.contains(owner)) return false;

        int limit = plugin.getConfig().getInt("rate-limit", 60);
        if (owner != null) { int custom = getRateLimit(owner); if (custom >= 0) limit = custom; }
        if (limit <= 0) { rateLimitHits.put(apiKey, 0); return true; }

        long nowWindow = System.currentTimeMillis() / 1000L / 60L;
        long nowMillis = System.currentTimeMillis();

        synchronized (conn) {
            try {
                conn.setAutoCommit(false);
                try (PreparedStatement sel = conn.prepareStatement(
                        "SELECT requests, window FROM rate_limits WHERE api_key = ?")) {
                    sel.setString(1, apiKey);
                    try (ResultSet rs = sel.executeQuery()) {
                        boolean allowed;
                        if (rs.next()) {
                            long sw = rs.getLong("window"); int req = rs.getInt("requests");
                            if (sw != nowWindow) {
                                updateRL(apiKey, 1, nowWindow, nowMillis);
                                rateLimitHits.put(apiKey, 0); // reset on new window
                                allowed = true;
                            } else if (req >= limit) {
                                allowed = false;
                            } else {
                                updateRL(apiKey, req + 1, nowWindow, nowMillis);
                                rateLimitHits.put(apiKey, 0);
                                allowed = true;
                            }
                        } else {
                            try (PreparedStatement ins = conn.prepareStatement(
                                    "INSERT INTO rate_limits (api_key,requests,window,total,last_used) VALUES (?,1,?,1,?)")) {
                                ins.setString(1, apiKey); ins.setLong(2, nowWindow); ins.setLong(3, nowMillis);
                                ins.executeUpdate();
                            }
                            rateLimitHits.put(apiKey, 0);
                            allowed = true;
                        }
                        conn.commit();

                        // Auto-ban check
                        if (!allowed && owner != null) {
                            int hits = rateLimitHits.merge(apiKey, 1, Integer::sum);
                            if (hits >= AUTO_BAN_THRESHOLD) {
                                try {
                                    setBanned(owner, true);
                                    plugin.getLogger().warning("[BWStatsAPI] Auto-banned " +
                                        apiKey + " after " + hits + " consecutive rate limit hits.");
                                } catch (SQLException ex) {
                                    plugin.getLogger().warning("Auto-ban failed: " + ex.getMessage());
                                }
                            }
                        }

                        return allowed;
                    }
                }
            } catch (SQLException e) {
                try { conn.rollback(); } catch (SQLException ignored) {}
                plugin.getLogger().log(Level.WARNING, "Rate-limit check failed", e);
                return true;
            } finally {
                try { conn.setAutoCommit(true); } catch (SQLException ignored) {}
            }
        }
    }

    private void updateRL(String apiKey, int requests, long window, long lastUsed) throws SQLException {
        try (PreparedStatement ps = conn.prepareStatement(
                "INSERT OR REPLACE INTO rate_limits (api_key,requests,window,total,last_used) " +
                "VALUES (?,?,?,COALESCE((SELECT total FROM rate_limits WHERE api_key=?),0)+1,?)")) {
            ps.setString(1, apiKey); ps.setInt(2, requests); ps.setLong(3, window);
            ps.setString(4, apiKey); ps.setLong(5, lastUsed); ps.executeUpdate();
        }
    }

    private static String generateKey() {
        byte[] bytes = new byte[20]; RNG.nextBytes(bytes);
        StringBuilder sb = new StringBuilder("bw_");
        for (byte b : bytes) sb.append(String.format("%02x", b));
        return sb.toString();
    }
}
