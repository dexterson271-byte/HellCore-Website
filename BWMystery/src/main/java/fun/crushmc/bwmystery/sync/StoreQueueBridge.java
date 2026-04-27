package fun.crushmc.bwmystery.sync;

import fun.crushmc.bwmystery.BWMystery;
import fun.crushmc.bwmystery.data.MysteryBox;
import fun.crushmc.bwmystery.data.PlayerProfile;
import org.bukkit.Bukkit;
import org.bukkit.OfflinePlayer;
import org.bukkit.entity.Player;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.util.Properties;
import java.util.UUID;

/**
 * Polls the shared store command queue for Bukkit-targeted rewards and executes
 * them on this server's console. This lets BWMystery fulfill store purchases
 * without requiring another game-server plugin to proxy the command.
 */
public final class StoreQueueBridge {

    private final BWMystery plugin;
    private final boolean enabled;
    private final String jdbcUrl;
    private final String host;
    private final int port;
    private final String database;
    private final String user;
    private final String password;

    public StoreQueueBridge(BWMystery plugin) {
        this.plugin = plugin;
        this.enabled = plugin.getConfig().getBoolean("queue.enabled", true);

        this.host = plugin.getConfig().getString("queue.mysql.host", "127.0.0.1");
        this.port = plugin.getConfig().getInt("queue.mysql.port", 3306);
        this.database = plugin.getConfig().getString("queue.mysql.database", "railway");
        this.user = plugin.getConfig().getString("queue.mysql.user", "root");
        this.password = plugin.getConfig().getString("queue.mysql.password", "");
        this.jdbcUrl = "jdbc:mysql://" + this.host + ":" + this.port + "/" + this.database;
    }

    public void start() {
        if (!enabled) {
            plugin.getLogger().info("Store queue bridge disabled in config.");
            return;
        }

        long period = Math.max(2L, plugin.getConfig().getLong("queue.poll-seconds", 5L)) * 20L;
        Bukkit.getScheduler().runTaskTimerAsynchronously(plugin, this::poll, 20L * 5L, period);
        plugin.getLogger().info("Store queue bridge enabled. Target DB: " + host + ":" + port + "/" + database);
    }

    private Connection getConnection() throws Exception {
        String driver = "com.mysql.cj.jdbc.Driver";
        try {
            Class.forName("com.mysql.cj.jdbc.Driver");
        } catch (ClassNotFoundException first) {
            driver = "com.mysql.jdbc.Driver";
            Class.forName(driver);
        }
        Properties props = new Properties();
        props.setProperty("user", user);
        props.setProperty("password", password);
        props.setProperty("useSSL", "false");
        props.setProperty("tcpKeepAlive", "true");
        props.setProperty("connectTimeout", "5000");
        props.setProperty("socketTimeout", "10000");
        plugin.getLogger().info("Opening store queue DB connection via " + driver + " to " + jdbcUrl);
        return DriverManager.getConnection(jdbcUrl, props);
    }

    private void ensureSchema(Connection conn) {
        try (PreparedStatement create = conn.prepareStatement(
                "CREATE TABLE IF NOT EXISTS hc_command_queue (" +
                        "id INT AUTO_INCREMENT PRIMARY KEY, " +
                        "command VARCHAR(255) NOT NULL, " +
                        "target VARCHAR(20) DEFAULT 'proxy', " +
                        "status VARCHAR(20) DEFAULT 'pending', " +
                        "created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)")) {
            create.executeUpdate();
        } catch (Exception e) {
            plugin.getLogger().warning("Queue schema verify failed: " + e.getMessage());
        }
        try (PreparedStatement alter = conn.prepareStatement(
                "ALTER TABLE hc_command_queue ADD COLUMN target VARCHAR(20) DEFAULT 'proxy'")) {
            alter.executeUpdate();
        } catch (Exception ignored) {}
    }

    private void poll() {
        try (Connection conn = getConnection()) {
            ensureSchema(conn);
            try (PreparedStatement select = conn.prepareStatement(
                    "SELECT id, command FROM hc_command_queue " +
                            "WHERE status = 'pending' AND target = 'bukkit' ORDER BY id ASC LIMIT 10")) {
                ResultSet rs = select.executeQuery();
                while (rs.next()) {
                    final int id = rs.getInt("id");
                    final String command = rs.getString("command");
                    if (!claimCommand(id)) continue;
                    Bukkit.getScheduler().runTask(plugin, () -> execute(id, command));
                }
            }
        } catch (Exception e) {
            plugin.getLogger().warning("Store queue poll failed: " + e.getClass().getName() + ": " + e.getMessage());
        }
    }

    private boolean claimCommand(int id) {
        try (Connection conn = getConnection();
             PreparedStatement update = conn.prepareStatement(
                     "UPDATE hc_command_queue SET status = 'processing' " +
                             "WHERE id = ? AND status = 'pending' AND target = 'bukkit'")) {
            update.setInt(1, id);
            return update.executeUpdate() == 1;
        } catch (Exception e) {
            plugin.getLogger().warning("Failed to claim queue command [" + id + "]: " + e.getClass().getName() + ": " + e.getMessage());
            return false;
        }
    }

    private void execute(int id, String command) {
        boolean success = false;
        try {
            success = executeInternally(command);
            if (!success) {
                success = Bukkit.dispatchCommand(Bukkit.getConsoleSender(), command);
            }
            plugin.getLogger().info("Executed store reward [" + id + "]: " + command + " => " + success);
        } catch (Exception e) {
            plugin.getLogger().warning("Store reward execution failed [" + id + "]: " + e.getMessage());
        }
        final boolean finalSuccess = success;
        Bukkit.getScheduler().runTaskAsynchronously(plugin, () -> finish(id, finalSuccess));
    }

    private void finish(int id, boolean success) {
        try (Connection conn = getConnection();
             PreparedStatement update = conn.prepareStatement(
                     "UPDATE hc_command_queue SET status = ? WHERE id = ?")) {
            update.setString(1, success ? "completed" : "failed");
            update.setInt(2, id);
            update.executeUpdate();
        } catch (Exception e) {
            plugin.getLogger().warning("Failed to finalize queue command [" + id + "]: " + e.getClass().getName() + ": " + e.getMessage());
        }
    }

    private boolean executeInternally(String rawCommand) {
        String command = String.valueOf(rawCommand).trim();
        if (command.isEmpty()) return false;

        String[] parts = command.split("\\s+");
        if (parts.length < 1) return false;

        String root = parts[0].toLowerCase();
        if ("bwmystery:gmysteryboxes".equals(root)) {
            return handleMysteryBoxes(parts);
        }
        if ("bwmystery:mysterydust".equals(root)) {
            return handleMysteryDust(parts);
        }
        if ("bwmystery:mysterycoins".equals(root)) {
            return handleMysteryCoins(parts);
        }
        return false;
    }

    private boolean handleMysteryBoxes(String[] parts) {
        if (parts.length < 4 || !"give".equalsIgnoreCase(parts[1])) return false;
        UUID targetUuid = resolvePlayerUuid(parts[2]);
        if (targetUuid == null) return false;
        int amount;
        try {
            amount = Integer.parseInt(parts[3]);
        } catch (NumberFormatException ex) {
            return false;
        }
        if (amount <= 0) return false;

        String quality = parts.length >= 5 ? parts[4] : plugin.getConfig().getString("defaults.box-quality", "COMMON");
        long expiresAt = 0L;
        for (int i = 5; i < parts.length; i++) {
            String token = parts[i];
            if (token.toLowerCase().startsWith("ex=") && !"ex=false".equalsIgnoreCase(token)) {
                expiresAt = 0L;
            }
        }

        PlayerProfile profile = plugin.getDataStore().get(targetUuid);
        for (int i = 0; i < amount; i++) {
            profile.addBox(new MysteryBox(UUID.randomUUID(), quality, expiresAt));
        }
        plugin.getDataStore().markDirty();
        Player online = Bukkit.getPlayer(targetUuid);
        if (online != null) {
            online.sendMessage("You received " + amount + " " + quality.toUpperCase() + " mystery box(es).");
        }
        return true;
    }

    private boolean handleMysteryDust(String[] parts) {
        if (parts.length < 4 || !"add".equalsIgnoreCase(parts[1])) return false;
        UUID targetUuid = resolvePlayerUuid(parts[2]);
        if (targetUuid == null) return false;
        long amount;
        try {
            amount = Long.parseLong(parts[3]);
        } catch (NumberFormatException ex) {
            return false;
        }
        PlayerProfile profile = plugin.getDataStore().get(targetUuid);
        profile.addDust(amount);
        plugin.getDataStore().markDirty();
        return true;
    }

    private boolean handleMysteryCoins(String[] parts) {
        if (parts.length < 4 || !"add".equalsIgnoreCase(parts[1])) return false;
        UUID targetUuid = resolvePlayerUuid(parts[2]);
        if (targetUuid == null) return false;
        long amount;
        try {
            amount = Long.parseLong(parts[3]);
        } catch (NumberFormatException ex) {
            return false;
        }
        PlayerProfile profile = plugin.getDataStore().get(targetUuid);
        profile.addCoins(amount);
        plugin.getDataStore().markDirty();
        return true;
    }

    private UUID resolvePlayerUuid(String name) {
        Player online = Bukkit.getPlayerExact(name);
        if (online != null) return online.getUniqueId();
        @SuppressWarnings("deprecation")
        OfflinePlayer offline = Bukkit.getOfflinePlayer(name);
        return offline != null ? offline.getUniqueId() : null;
    }
}
