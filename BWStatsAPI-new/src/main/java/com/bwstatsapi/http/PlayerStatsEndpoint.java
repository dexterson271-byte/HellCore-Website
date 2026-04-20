package com.bwstatsapi.http;

import com.bwstatsapi.BWStatsAPI;
import com.bwstatsapi.stats.GroupStatsProvider;
import com.bwstatsapi.stats.GuildProvider;
import com.bwstatsapi.stats.StatsProvider;
import com.bwstatsapi.util.JsonBuilder;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import org.bukkit.Bukkit;
import org.bukkit.OfflinePlayer;

import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.*;

public class PlayerStatsEndpoint implements HttpHandler {

    private final BWStatsAPI plugin;
    private final StatsProvider statsProvider;
    private final GuildProvider guildProvider;
    private final GroupStatsProvider groupStatsProvider;

    public PlayerStatsEndpoint(BWStatsAPI plugin) {
        this.plugin             = plugin;
        this.statsProvider      = new StatsProvider();
        this.guildProvider      = new GuildProvider();
        this.groupStatsProvider = new GroupStatsProvider();
    }

    @Override
    public void handle(HttpExchange exchange) throws IOException {
        if (!"GET".equalsIgnoreCase(exchange.getRequestMethod())) {
            respond(exchange, 405, JsonBuilder.error(405, "Method Not Allowed"));
            return;
        }

        if (plugin.getConfig().getBoolean("log-requests", false)) {
            plugin.getLogger().info("[API] " + exchange.getRemoteAddress() + " → " + exchange.getRequestURI());
        }

        Map<String, String> params = parseQuery(exchange.getRequestURI().getRawQuery());
        String apiKey = params.get("apikey");
        if (apiKey == null || apiKey.isEmpty()) {
            respond(exchange, 401, JsonBuilder.error(401, "Missing 'apikey' query parameter"));
            return;
        }

        UUID ownerUuid = plugin.getApiKeyManager().getOwner(apiKey);
        if (ownerUuid == null) {
            respond(exchange, 403, JsonBuilder.error(403, "Invalid API key"));
            return;
        }

        if (!plugin.getApiKeyManager().isAllowed(apiKey)) {
            respond(exchange, 429, JsonBuilder.error(429, "Rate limit exceeded"));
            return;
        }

        String path = exchange.getRequestURI().getPath();
        String tail = path.replaceFirst("^/api/v1/player/?", "");

        UUID   targetUuid;
        String targetName;

        if (tail.startsWith("uuid/")) {
            String rawUuid = tail.substring("uuid/".length());
            try { targetUuid = UUID.fromString(rawUuid); }
            catch (IllegalArgumentException e) {
                respond(exchange, 400, JsonBuilder.error(400, "Invalid UUID format"));
                return;
            }
            @SuppressWarnings("deprecation")
            OfflinePlayer op = Bukkit.getOfflinePlayer(targetUuid);
            targetName = op.getName() != null ? op.getName() : targetUuid.toString();
        } else {
            targetName = tail.isEmpty() ? null : tail;
            if (targetName == null) {
                respond(exchange, 400, JsonBuilder.error(400,
                    "Usage: /api/v1/player/{username} or /api/v1/player/uuid/{uuid}"));
                return;
            }
            @SuppressWarnings("deprecation")
            OfflinePlayer op = Bukkit.getOfflinePlayer(targetName);
            targetUuid = op.getUniqueId();
        }

        Map<String, Object> stats = statsProvider.getStats(targetUuid);
        if (stats == null) {
            respond(exchange, 404, JsonBuilder.error(404,
                "Player '" + targetName + "' has no BedWars stats on this server"));
            return;
        }

        stats.put("username", targetName);

        // Guild info
        if (GuildProvider.isAvailable()) {
            stats.put("guild", guildProvider.getGuildInfo(targetUuid));
        }

        // Group stats
        if (GroupStatsProvider.isAvailable()) {
            stats.put("groupStats", groupStatsProvider.getGroupStats(targetUuid));
        }

        Map<String, Object> root = new LinkedHashMap<>();
        root.put("success", true);
        root.put("player",  stats);

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
