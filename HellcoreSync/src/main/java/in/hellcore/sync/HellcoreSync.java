package in.hellcore.sync;

import com.google.inject.Inject;
import com.velocitypowered.api.event.Subscribe;
import com.velocitypowered.api.event.proxy.ProxyInitializeEvent;
import com.velocitypowered.api.event.proxy.ProxyShutdownEvent;
import com.velocitypowered.api.plugin.Plugin;
import com.velocitypowered.api.plugin.annotation.DataDirectory;
import com.velocitypowered.api.proxy.ProxyServer;
import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import org.slf4j.Logger;

import java.io.*;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.util.Properties;
import java.util.concurrent.TimeUnit;

@Plugin(id = "hellcoresync", name = "HellcoreSync", version = "1.0", description = "Syncs website DB command queue and player counts", authors = {"Developer"})
public class HellcoreSync {

    private final ProxyServer server;
    private final Logger logger;
    private final Path dataDirectory;
    private HikariDataSource dataSource;

    @Inject
    public HellcoreSync(ProxyServer server, Logger logger, @DataDirectory Path dataDirectory) {
        this.server = server;
        this.logger = logger;
        this.dataDirectory = dataDirectory;
    }

    @Subscribe
    public void onProxyInitialization(ProxyInitializeEvent event) {
        if (!setupDatabase()) {
            logger.error("Failed to connect to MySQL database! Sync duties paused.");
            return;
        }

        // Poll Command Queue every 5 seconds
        server.getScheduler().buildTask(this, this::pollCommandQueue)
                .repeat(5L, TimeUnit.SECONDS)
                .schedule();

        // Push Dashboard Heartbeat every 3 seconds (Fast Live Updates)
        server.getScheduler().buildTask(this, this::pushLiveStats)
                .repeat(3L, TimeUnit.SECONDS)
                .schedule();

        // Push graph history snapshot every 3 minutes (Granular Graph Data)
        server.getScheduler().buildTask(this, this::pushHistorySnapshot)
                .repeat(3L, TimeUnit.MINUTES)
                .schedule();

        logger.info("HellcoreSync Plugin Booted successfully!");
    }

    @Subscribe
    public void onProxyShutdown(ProxyShutdownEvent event) {
        if (dataSource != null && !dataSource.isClosed()) {
            dataSource.close();
        }
    }

    private boolean setupDatabase() {
        try {
            if (!Files.exists(dataDirectory)) {
                Files.createDirectories(dataDirectory);
            }
            
            // Search Locations for config.properties
            File[] searchPaths = {
                new File(dataDirectory.toFile(), "config.properties"), // plugins/hellcoresync/
                new File("plugins" + File.separator + "HellcoreSync" + File.separator + "config.properties"), // plugins/HellcoreSync/
                new File("config.properties") // root folder
            };

            File configFile = searchPaths[0];
            for (File path : searchPaths) {
                if (path.exists()) {
                    configFile = path;
                    break;
                }
            }

            logger.info("Using config file found at: " + configFile.getAbsolutePath());
            Properties props = new Properties();
            if (!configFile.exists()) {
                logger.info("Configuration file not found. Creating default at: " + searchPaths[0].getPath());
                props.setProperty("mysql.host", "localhost");
                props.setProperty("mysql.port", "3306");
                props.setProperty("mysql.database", "hellcore");
                props.setProperty("mysql.user", "root");
                props.setProperty("mysql.password", "");
                props.setProperty("discord.webhook", "https://discord.com/api/webhooks/1495063212415254648/Wb66npovkjNTZLesUAHn3Mli9yD7nUr8utc-ZvLvtz3hY5C_sjOlPu-Jr_8SKHyn0LkO");
                try (FileOutputStream out = new FileOutputStream(searchPaths[0])) {
                    props.store(out, "HellcoreSync Configuration");
                }
            } else {
                try (FileInputStream in = new FileInputStream(configFile)) {
                    props.load(in);
                }
            }
            
            String webhookUrl = props.getProperty("discord.webhook", "").trim();

            logger.info("Initializing MySQL Connection Pool...");
            String host = props.getProperty("mysql.host");
            String port = props.getProperty("mysql.port");
            String database = props.getProperty("mysql.database");
            logger.info("Target: " + host + ":" + port + "/" + database);

            HikariConfig config = new HikariConfig();
            // Use SSL=false for Railway to avoid trustStore issues, keep it for others
            String sslParam = host.contains("rlwy.net") ? "useSSL=false" : "useSSL=true"; 
            config.setJdbcUrl("jdbc:mysql://" + host + ":" + port + "/" + database + "?" + sslParam + "&autoReconnect=true&allowPublicKeyRetrieval=true");
            config.setDriverClassName("com.mysql.cj.jdbc.Driver");
            config.setUsername(props.getProperty("mysql.user"));
            config.setPassword(props.getProperty("mysql.password"));
            config.setMaximumPoolSize(5);
            config.setConnectionTimeout(30000);

            dataSource = new HikariDataSource(config);
            
            try (Connection conn = dataSource.getConnection()) {
                logger.info("✓ Successfully connected to MySQL database!");
                try (PreparedStatement ps1 = conn.prepareStatement("CREATE TABLE IF NOT EXISTS hc_command_queue (id INT AUTO_INCREMENT PRIMARY KEY, command VARCHAR(255) NOT NULL, status VARCHAR(20) DEFAULT 'pending', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)");
                     PreparedStatement ps2 = conn.prepareStatement("CREATE TABLE IF NOT EXISTS hc_server_metrics (" +
                             "server_name VARCHAR(50) PRIMARY KEY, " +
                             "online_players INT DEFAULT 0, " +
                             "max_players INT DEFAULT 0, " +
                             "server_ip VARCHAR(255) DEFAULT '', " +
                             "last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP)");
                     PreparedStatement ps3 = conn.prepareStatement("CREATE TABLE IF NOT EXISTS hc_player_history (id INT AUTO_INCREMENT PRIMARY KEY, timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP, total_players INT DEFAULT 0)")) {
                    ps1.executeUpdate();
                    ps2.executeUpdate();
                    ps3.executeUpdate();
                    logger.info("✓ Database schema verified & metrics synchronized.");
                }
                
                // Immediate initial heartbeat
                pushLiveStats();
                
                // Notify Discord
                if (!webhookUrl.isEmpty()) {
                    sendWebhook(webhookUrl, "{\"content\": \"🚀 **HellcoreSync** has successfully connected to Aiven Cloud and is now syncing with Web Nexus!\"}");
                }
            }
            return true;
        } catch (Exception e) {
            logger.error("FATAL ERROR during database setup: " + e.getMessage());
            e.printStackTrace();
            return false;
        }
    }

    private void sendWebhook(String urlStr, String jsonPayload) {
        try {
            URL url = new URL(urlStr);
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("POST");
            conn.setDoOutput(true);
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setRequestProperty("User-Agent", "Mozilla/5.0");
            
            try (OutputStream os = conn.getOutputStream()) {
                byte[] input = jsonPayload.getBytes(StandardCharsets.UTF_8);
                os.write(input, 0, input.length);
            }
            
            int responseCode = conn.getResponseCode();
            if (responseCode >= 200 && responseCode < 300) {
                logger.info("Discord notification sent successfully.");
            } else {
                logger.warn("Discord notification failed with response code: " + responseCode);
            }
            conn.disconnect();
        } catch (Exception e) {
            logger.warn("Failed to send Discord notification: " + e.getMessage());
        }
    }

    private void pollCommandQueue() {
        if (dataSource == null || dataSource.isClosed()) return;
        try (Connection conn = dataSource.getConnection();
             PreparedStatement select = conn.prepareStatement("SELECT id, command FROM hc_command_queue WHERE status = 'pending' LIMIT 10")) {
            
            ResultSet rs = select.executeQuery();
            while (rs.next()) {
                int id = rs.getInt("id");
                String command = rs.getString("command");
                
                logger.info("Executing Sync Command: " + command);
                server.getCommandManager().executeAsync(server.getConsoleCommandSource(), command).thenAccept(success -> {
                    try (Connection conn2 = dataSource.getConnection();
                         PreparedStatement up = conn2.prepareStatement("UPDATE hc_command_queue SET status = ? WHERE id = ?")) {
                        up.setString(1, success ? "completed" : "failed");
                        up.setInt(2, id);
                        up.executeUpdate();
                    } catch (Exception ex) {
                        logger.error("Failed to update command status for ID " + id + ": " + ex.getMessage());
                    }
                });
            }
        } catch (Exception e) {
            logger.warn("Command queue poll failed: " + e.getMessage());
        }
    }

    private void pushLiveStats() {
        if (dataSource == null || dataSource.isClosed()) return;
        try (Connection conn = dataSource.getConnection();
             PreparedStatement ps = conn.prepareStatement(
                     "INSERT INTO hc_server_metrics (server_name, online_players, max_players, server_ip) VALUES ('NETWORK', ?, ?, ?) " +
                     "ON DUPLICATE KEY UPDATE online_players = VALUES(online_players), max_players = VALUES(max_players)")) {
            ps.setInt(1, server.getPlayerCount());
            ps.setInt(2, server.getConfiguration().getShowMaxPlayers());
            ps.setString(3, "mc.hellcore.in"); // Canonical IP
            ps.executeUpdate();
        } catch (Exception e) {
            // Heartbeat failures logged only as warn to prevent spam
            if (Math.random() < 0.01) logger.warn("Heartbeat sync issue: " + e.getMessage());
        }
    }

    private void pushHistorySnapshot() {
        if (dataSource == null || dataSource.isClosed()) return;
        try (Connection conn = dataSource.getConnection();
             PreparedStatement ps = conn.prepareStatement(
                     "INSERT INTO hc_player_history (total_players) VALUES (?)")) {
            ps.setInt(1, server.getPlayerCount());
            ps.executeUpdate();
            logger.info("Synced 24h history snapshot (" + server.getPlayerCount() + " players)");
        } catch (Exception e) {
            logger.error("History snapshot failed: " + e.getMessage());
        }
    }
}
