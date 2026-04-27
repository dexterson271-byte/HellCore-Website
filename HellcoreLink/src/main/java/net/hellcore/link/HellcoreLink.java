package net.hellcore.link;

import org.bukkit.Bukkit;
import org.bukkit.ChatColor;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;
import org.bukkit.plugin.java.JavaPlugin;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.lang.reflect.Method;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.util.concurrent.CompletableFuture;

public class HellcoreLink extends JavaPlugin implements CommandExecutor {

    private String apiUrl;
    private String prefix;
    private boolean queueEnabled;
    private int queuePollSeconds;
    private String mysqlHost;
    private int mysqlPort;
    private String mysqlDatabase;
    private String mysqlUser;
    private String mysqlPassword;

    @Override
    public void onEnable() {
        saveDefaultConfig();
        reloadConfigValues();

        getCommand("verify").setExecutor(this);

        Bukkit.getScheduler().runTaskTimerAsynchronously(this, this::sendMetrics, 20L * 10, 20L * 60);

        if (queueEnabled) {
            long period = Math.max(2, queuePollSeconds) * 20L;
            Bukkit.getScheduler().runTaskTimerAsynchronously(this, this::pollCommandQueue, 20L * 5, period);
            getLogger().info("HellcoreLink queue sync enabled.");
        }

        getLogger().info("HellcoreLink has been enabled with Metrics reporting!");
    }

    private void reloadConfigValues() {
        this.apiUrl = getConfig().getString("api-url");
        this.prefix = ChatColor.translateAlternateColorCodes('&', getConfig().getString("messages.prefix"));
        this.queueEnabled = getConfig().getBoolean("queue.enabled", true);
        this.queuePollSeconds = getConfig().getInt("queue.poll-seconds", 5);
        this.mysqlHost = getConfig().getString("queue.mysql.host", "127.0.0.1");
        this.mysqlPort = getConfig().getInt("queue.mysql.port", 3306);
        this.mysqlDatabase = getConfig().getString("queue.mysql.database", "railway");
        this.mysqlUser = getConfig().getString("queue.mysql.user", "root");
        this.mysqlPassword = getConfig().getString("queue.mysql.password", "");
    }

    private String jdbcUrl() {
        return "jdbc:mysql://" + mysqlHost + ":" + mysqlPort + "/" + mysqlDatabase
                + "?useSSL=false&allowPublicKeyRetrieval=true&autoReconnect=true";
    }

    private Connection getConnection() throws Exception {
        return DriverManager.getConnection(jdbcUrl(), mysqlUser, mysqlPassword);
    }

    private void ensureQueueSchema(Connection conn) {
        try (PreparedStatement create = conn.prepareStatement(
                "CREATE TABLE IF NOT EXISTS hc_command_queue (" +
                        "id INT AUTO_INCREMENT PRIMARY KEY, " +
                        "command VARCHAR(255) NOT NULL, " +
                        "target VARCHAR(20) DEFAULT 'proxy', " +
                        "status VARCHAR(20) DEFAULT 'pending', " +
                        "created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)")) {
            create.executeUpdate();
        } catch (Exception e) {
            getLogger().warning("Could not verify hc_command_queue: " + e.getMessage());
        }
        try (PreparedStatement alter = conn.prepareStatement(
                "ALTER TABLE hc_command_queue ADD COLUMN target VARCHAR(20) DEFAULT 'proxy'")) {
            alter.executeUpdate();
        } catch (Exception ignored) {}
    }

    private void pollCommandQueue() {
        if (!queueEnabled) return;
        try (Connection conn = getConnection()) {
            ensureQueueSchema(conn);
            try (PreparedStatement select = conn.prepareStatement(
                    "SELECT id, command FROM hc_command_queue " +
                            "WHERE status = 'pending' AND target = 'bukkit' ORDER BY id ASC LIMIT 10")) {
                ResultSet rs = select.executeQuery();
                while (rs.next()) {
                    int id = rs.getInt("id");
                    String command = rs.getString("command");
                    Bukkit.getScheduler().runTask(this, () -> executeQueuedCommand(id, command));
                }
            }
        } catch (Exception e) {
            getLogger().warning("Queue poll failed: " + e.getMessage());
        }
    }

    private void executeQueuedCommand(int id, String command) {
        boolean success = false;
        try {
            success = Bukkit.dispatchCommand(Bukkit.getConsoleSender(), command);
            getLogger().info("Executed store command [" + id + "]: " + command + " => " + success);
        } catch (Exception e) {
            getLogger().warning("Command execution failed for [" + id + "]: " + e.getMessage());
        }
        final boolean finalSuccess = success;
        Bukkit.getScheduler().runTaskAsynchronously(this, () -> updateQueueStatus(id, finalSuccess ? "completed" : "failed"));
    }

    private void updateQueueStatus(int id, String status) {
        try (Connection conn = getConnection();
             PreparedStatement update = conn.prepareStatement("UPDATE hc_command_queue SET status = ? WHERE id = ?")) {
            update.setString(1, status);
            update.setInt(2, id);
            update.executeUpdate();
        } catch (Exception e) {
            getLogger().warning("Failed updating queue status for [" + id + "]: " + e.getMessage());
        }
    }

    private void sendMetrics() {
        try {
            int online = Bukkit.getOnlinePlayers().size();
            int max = Bukkit.getMaxPlayers();
            String serverName = Bukkit.getServer().getName();

            int arenas = 0;
            int inGame = 0;

            if (Bukkit.getPluginManager().isPluginEnabled("BedWars1058")) {
                int[] bw = resolveBedwarsMetrics();
                arenas = bw[0];
                inGame = bw[1];
            }

            String metricsUrl = apiUrl.replace("/verify/confirm", "/metrics/update")
                    + "?online=" + online
                    + "&max=" + max
                    + "&server=" + serverName
                    + "&arenas=" + arenas
                    + "&ingame=" + inGame;

            URL url = new URL(metricsUrl);
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("GET");
            conn.setConnectTimeout(5000);
            conn.getResponseCode();
            conn.disconnect();
        } catch (Exception ignored) {}
    }

    private int[] resolveBedwarsMetrics() {
        try {
            Class<?> bedWarsClass = Class.forName("com.andrei1058.bedwars.api.BedWars");
            Object bwApi = Bukkit.getServicesManager().load(bedWarsClass);
            if (bwApi == null) return new int[] {0, 0};

            Method getArenaUtil = bedWarsClass.getMethod("getArenaUtil");
            Object arenaUtil = getArenaUtil.invoke(bwApi);
            Method getArenas = arenaUtil.getClass().getMethod("getArenas");
            Iterable<?> arenas = (Iterable<?>) getArenas.invoke(arenaUtil);

            int arenaCount = 0;
            int inGame = 0;
            for (Object arena : arenas) {
                arenaCount++;
                Method getStatus = arena.getClass().getMethod("getStatus");
                Method getPlayers = arena.getClass().getMethod("getPlayers");
                Object status = getStatus.invoke(arena);
                String name = String.valueOf(status).toLowerCase();
                if ("starting".equals(name) || "playing".equals(name)) {
                    Object players = getPlayers.invoke(arena);
                    if (players instanceof java.util.Collection) {
                        inGame += ((java.util.Collection<?>) players).size();
                    }
                }
            }
            return new int[] {arenaCount, inGame};
        } catch (Exception ignored) {
            return new int[] {0, 0};
        }
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        if (!(sender instanceof Player)) {
            sender.sendMessage("This command is for players only.");
            return true;
        }

        Player player = (Player) sender;

        if (args.length != 1) {
            player.sendMessage(prefix + ChatColor.translateAlternateColorCodes('&', getConfig().getString("messages.usage")));
            return true;
        }

        String code = args[0];
        player.sendMessage(prefix + ChatColor.translateAlternateColorCodes('&', getConfig().getString("messages.verifying")));

        CompletableFuture.runAsync(() -> {
            String resultMessage;
            try {
                String requestUrl = apiUrl + "?code=" + code + "&uuid=" + player.getUniqueId().toString() + "&username=" + player.getName();
                URL url = new URL(requestUrl);
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("GET");
                conn.setConnectTimeout(5000);
                conn.setReadTimeout(5000);

                int responseCode = conn.getResponseCode();
                if (responseCode == 200) {
                    resultMessage = prefix + ChatColor.translateAlternateColorCodes('&', getConfig().getString("messages.success"));
                } else {
                    resultMessage = prefix + ChatColor.translateAlternateColorCodes('&', getConfig().getString("messages.error"));
                }
                try (BufferedReader ignored = new BufferedReader(new InputStreamReader(conn.getInputStream()))) {
                    // Drain for cleaner connection handling.
                } catch (Exception ignored) {}
                conn.disconnect();
            } catch (Exception e) {
                resultMessage = prefix + ChatColor.RED + "An error occurred while connecting to the website.";
                getLogger().warning("Verify request failed: " + e.getMessage());
            }
            final String finalMessage = resultMessage;
            Bukkit.getScheduler().runTask(this, () -> {
                if (player.isOnline()) player.sendMessage(finalMessage);
            });
        });

        return true;
    }
}
