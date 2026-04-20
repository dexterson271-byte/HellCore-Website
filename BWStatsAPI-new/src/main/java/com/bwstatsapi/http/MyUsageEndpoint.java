package com.bwstatsapi.http;

import com.bwstatsapi.BWStatsAPI;
import com.bwstatsapi.stats.ApiKeyManager;
import com.bwstatsapi.util.JsonBuilder;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import org.bukkit.Bukkit;
import org.bukkit.OfflinePlayer;

import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.*;

/**
 * GET /api/v1/myusage?apikey=...
 * Returns the caller's own key usage stats.
 */
public class MyUsageEndpoint implements HttpHandler {

    private static final SimpleDateFormat SDF = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss");
    private final BWStatsAPI plugin;

    public MyUsageEndpoint(BWStatsAPI plugin) { this.plugin = plugin; }

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

        ApiKeyManager mgr = plugin.getApiKeyManager();
        UUID owner = mgr.getOwner(apiKey);
        if (owner == null) {
            respond(exchange, 403, JsonBuilder.error(403, "Invalid API key")); return;
        }

        // Note: don't count this request against rate limit for /myusage
        int rateLimit    = mgr.getRateLimit(owner);
        int effectiveLimit = rateLimit >= 0 ? rateLimit : plugin.getConfig().getInt("rate-limit", 60);
        int thisMinute   = mgr.getRequestsThisMinute(apiKey);
        long total       = mgr.getTotalRequests(owner);
        long lastUsed    = mgr.getLastUsed(owner);
        long createdAt   = mgr.getCreatedAt(owner);
        boolean banned   = mgr.isBanned(owner);

        @SuppressWarnings("deprecation")
        OfflinePlayer op = Bukkit.getOfflinePlayer(owner);
        String username  = op.getName() != null ? op.getName() : owner.toString();

        Map<String, Object> usage = new LinkedHashMap<>();
        usage.put("uuid",           owner.toString());
        usage.put("username",       username);
        usage.put("apiKey",         apiKey);
        usage.put("banned",         banned);
        usage.put("createdAt",      createdAt == 0 ? null : SDF.format(new Date(createdAt * 1000L)));
        usage.put("totalRequests",  total);
        usage.put("thisMinute",     thisMinute);
        usage.put("rateLimit",      effectiveLimit == 0 ? "unlimited" : effectiveLimit + "/min");
        usage.put("lastUsed",       lastUsed == 0 ? null : SDF.format(new Date(lastUsed)));
        usage.put("remainingThisMinute", effectiveLimit == 0 ? "unlimited"
            : Math.max(0, effectiveLimit - thisMinute));

        Map<String, Object> root = new LinkedHashMap<>();
        root.put("success", true);
        root.put("usage",   usage);
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
