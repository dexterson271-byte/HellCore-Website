package com.bwstatsapi.http;

import com.bwstatsapi.BWStatsAPI;
import com.bwstatsapi.stats.LeaderboardProvider;
import com.bwstatsapi.util.JsonBuilder;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;

import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/**
 * GET /api/v1/leaderboard/{stat}?apikey=...&limit=10
 * Returns top players for the given stat.
 */
public class LeaderboardEndpoint implements HttpHandler {

    private static final long CACHE_TTL_MS = 30_000L;
    private static final ConcurrentHashMap<String, CachedBoard> CACHE = new ConcurrentHashMap<>();

    private static final class CachedBoard {
        final long expiresAt;
        final List<Map<String, Object>> entries;
        CachedBoard(List<Map<String, Object>> entries) {
            this.entries = entries;
            this.expiresAt = System.currentTimeMillis() + CACHE_TTL_MS;
        }
    }

    private final BWStatsAPI plugin;
    private final LeaderboardProvider provider;

    public LeaderboardEndpoint(BWStatsAPI plugin) {
        this.plugin   = plugin;
        this.provider = new LeaderboardProvider();
    }

    @Override
    public void handle(HttpExchange exchange) throws IOException {
        if (!"GET".equalsIgnoreCase(exchange.getRequestMethod())) {
            respond(exchange, 405, JsonBuilder.error(405, "Method Not Allowed")); return;
        }

        Map<String, String> params = parseQuery(exchange.getRequestURI().getRawQuery());
        String apiKey = params.get("apikey");
        if (apiKey == null || apiKey.isEmpty()) {
            respond(exchange, 401, JsonBuilder.error(401, "Missing apikey")); return;
        }
        if (plugin.getApiKeyManager().getOwner(apiKey) == null) {
            respond(exchange, 403, JsonBuilder.error(403, "Invalid API key")); return;
        }
        if (!plugin.getApiKeyManager().isAllowed(apiKey)) {
            respond(exchange, 429, JsonBuilder.error(429, "Rate limit exceeded")); return;
        }

        // Extract stat from path: /api/v1/leaderboard/{stat}
        String path = exchange.getRequestURI().getPath();
        String stat = path.replaceFirst("^/api/v1/leaderboard/?", "").trim();

        if (stat.isEmpty() || !LeaderboardProvider.VALID_STATS.contains(stat)) {
            respond(exchange, 400, JsonBuilder.error(400,
                "Invalid stat. Valid options: " + LeaderboardProvider.VALID_STATS)); return;
        }

        int limit = 10;
        try { limit = Math.min(100, Math.max(1, Integer.parseInt(params.getOrDefault("limit", "10")))); }
        catch (NumberFormatException ignored) {}

        String cacheKey = stat + ":" + limit;
        CachedBoard cached = CACHE.get(cacheKey);
        List<Map<String, Object>> board;
        if (cached != null && cached.expiresAt > System.currentTimeMillis()) {
            board = cached.entries;
        } else {
            board = provider.getLeaderboard(stat, limit,
                plugin.getApiKeyManager().getAllKeyOwners());
            CACHE.put(cacheKey, new CachedBoard(board));
        }

        Map<String, Object> root = new LinkedHashMap<>();
        root.put("success", true);
        root.put("stat",    stat);
        root.put("limit",   limit);
        root.put("entries", board);
        respond(exchange, 200, JsonBuilder.toJson(root));
    }

    private static void respond(HttpExchange ex, int code, String json) throws IOException {
        byte[] body = json.getBytes(StandardCharsets.UTF_8);
        ex.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        ex.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
        ex.sendResponseHeaders(code, body.length);
        try (OutputStream os = ex.getResponseBody()) { os.write(body); }
    }

    private static Map<String, String> parseQuery(String query) {
        Map<String, String> out = new HashMap<>();
        if (query == null || query.isEmpty()) return out;
        for (String pair : query.split("&")) {
            int idx = pair.indexOf('=');
            if (idx < 0) out.put(pair, "");
            else out.put(pair.substring(0, idx), pair.substring(idx + 1));
        }
        return out;
    }
}
