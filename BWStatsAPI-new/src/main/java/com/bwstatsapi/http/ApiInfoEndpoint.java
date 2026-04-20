package com.bwstatsapi.http;

import com.bwstatsapi.BWStatsAPI;
import com.bwstatsapi.util.JsonBuilder;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;

import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * GET /api/v1/info
 *
 * No auth required. Returns basic API metadata so external clients
 * can confirm the server is reachable and learn available endpoints.
 */
public class ApiInfoEndpoint implements HttpHandler {

    private final BWStatsAPI plugin;

    public ApiInfoEndpoint(BWStatsAPI plugin) {
        this.plugin = plugin;
    }

    @Override
    public void handle(HttpExchange exchange) throws IOException {
        if (!"GET".equalsIgnoreCase(exchange.getRequestMethod())) {
            byte[] body = JsonBuilder.error(405, "Method Not Allowed")
                .getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
            exchange.sendResponseHeaders(405, body.length);
            try (OutputStream os = exchange.getResponseBody()) { os.write(body); }
            return;
        }

        Map<String, Object> info = new LinkedHashMap<>();
        info.put("plugin",      "BWStatsAPI");
        info.put("version",     plugin.getDescription().getVersion());
        info.put("success",     true);
        info.put("rateLimit",   plugin.getConfig().getInt("rate-limit", 60) + " req/min per key");
        info.put("endpoints", new String[]{
            "GET /api/v1/info",
            "GET /api/v1/player/{username}?apikey=<key>",
            "GET /api/v1/player/uuid/{uuid}?apikey=<key>"
        });

        byte[] body = JsonBuilder.toJson(info).getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        exchange.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
        exchange.sendResponseHeaders(200, body.length);
        try (OutputStream os = exchange.getResponseBody()) {
            os.write(body);
        }
    }
}
