package com.bwstatsapi.http;

import com.andrei1058.bedwars.api.BedWars;
import com.andrei1058.bedwars.api.arena.IArena;
import com.bwstatsapi.BWStatsAPI;
import com.bwstatsapi.util.JsonBuilder;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import org.bukkit.Bukkit;

import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.lang.management.ManagementFactory;
import java.util.*;

/**
 * GET /api/v1/server?apikey=...
 * Returns server info: online players, active arenas, TPS, uptime.
 */
public class ServerInfoEndpoint implements HttpHandler {

    private static final long START_TIME = System.currentTimeMillis();
    private final BWStatsAPI plugin;

    public ServerInfoEndpoint(BWStatsAPI plugin) { this.plugin = plugin; }

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

        Map<String, Object> data = new LinkedHashMap<>();

        // Basic server info
        data.put("serverName",    Bukkit.getServerName());
        data.put("onlinePlayers", Bukkit.getOnlinePlayers().size());
        data.put("maxPlayers",    Bukkit.getMaxPlayers());
        data.put("uptimeSeconds", (System.currentTimeMillis() - START_TIME) / 1000L);
        data.put("totalApiKeys",  plugin.getApiKeyManager().getAllKeyOwners().size());

        // BedWars arena info
        try {
            BedWars bwApi = (BedWars) Bukkit.getServicesManager()
                .getRegistration(BedWars.class).getProvider();
            List<Map<String, Object>> arenas = new ArrayList<>();
            int playersInGames = 0;
            for (IArena arena : bwApi.getArenaUtil().getArenas()) {
                Map<String, Object> a = new LinkedHashMap<>();
                a.put("name",       arena.getArenaName());
                a.put("group",      arena.getGroup());
                a.put("state",      arena.getStatus().name());
                a.put("players",    arena.getPlayers().size());
                a.put("maxPlayers", arena.getMaxPlayers());
                arenas.add(a);
                playersInGames += arena.getPlayers().size();
            }
            data.put("arenas",         arenas);
            data.put("playersInGames", playersInGames);
        } catch (Exception e) {
            data.put("arenas", Collections.emptyList());
            data.put("playersInGames", 0);
        }

        Map<String, Object> root = new LinkedHashMap<>();
        root.put("success", true);
        root.put("server",  data);
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
