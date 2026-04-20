package com.bwstatsapi.http;

import com.bwstatsapi.BWStatsAPI;
import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.util.concurrent.Executors;
import java.util.logging.Level;

public class StatsHttpServer {

    private final BWStatsAPI plugin;
    private HttpServer server;

    public StatsHttpServer(BWStatsAPI plugin) { this.plugin = plugin; }

    public void start() {
        int port    = plugin.getConfig().getInt("http-port", 7070);
        String bind = plugin.getConfig().getString("http-bind", "0.0.0.0");
        int threads = plugin.getConfig().getInt("http-threads", 4);

        try {
            server = HttpServer.create(new InetSocketAddress(bind, port), 50);
            server.setExecutor(Executors.newFixedThreadPool(threads));

            // Routes
            server.createContext("/api/v1/player",      new PlayerStatsEndpoint(plugin));
            server.createContext("/api/v1/info",        new ApiInfoEndpoint(plugin));
            server.createContext("/api/v1/leaderboard", new LeaderboardEndpoint(plugin));
            server.createContext("/api/v1/server",      new ServerInfoEndpoint(plugin));
            server.createContext("/api/v1/myusage",     new MyUsageEndpoint(plugin));

            server.start();
            plugin.getLogger().info("HTTP server started → http://" + bind + ":" + port);
        } catch (IOException e) {
            plugin.getLogger().log(Level.SEVERE, "Failed to start HTTP server on port " + port, e);
        }
    }

    public void stop() {
        if (server != null) {
            server.stop(0);
            plugin.getLogger().info("HTTP server stopped.");
        }
    }
}
