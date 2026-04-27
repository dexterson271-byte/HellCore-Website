package fun.crushmc.bwmystery.sync;

import fun.crushmc.bwmystery.BWMystery;
import org.bukkit.Bukkit;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;

/**
 * Polls the shared store command queue for Bukkit-targeted rewards and executes
 * them on this server's console. This lets BWMystery fulfill store purchases
 * without requiring another game-server plugin to proxy the command.
 */
public final class StoreQueueBridge {

    private final BWMystery plugin;
    private final boolean enabled;
    private final String jdbcUrl;
    private final String user;
    private final String password;

    public StoreQueueBridge(BWMystery plugin) {
        this.plugin = plugin;
        this.enabled = plugin.getConfig().getBoolean("queue.enabled", true);

        String host = plugin.getConfig().getString("queue.mysql.host", "127.0.0.1");
        int port = plugin.getConfig().getInt("queue.mysql.port", 3306);
        String database = plugin.getConfig().getString("queue.mysql.database", "railway");
        this.user = plugin.getConfig().getString("queue.mysql.user", "root");
        this.password = plugin.getConfig().getString("queue.mysql.password", "");
        this.jdbcUrl = "jdbc:mysql://" + host + ":" + port + "/" + database
                + "?useSSL=false&allowPublicKeyRetrieval=true&autoReconnect=true";
    }

    public void start() {
        if (!enabled) {
            plugin.getLogger().info("Store queue bridge disabled in config.");
            return;
        }

        long period = Math.max(2L, plugin.getConfig().getLong("queue.poll-seconds", 5L)) * 20L;
        Bukkit.getScheduler().runTaskTimerAsynchronously(plugin, this::poll, 20L * 5L, period);
        plugin.getLogger().info("Store queue bridge enabled.");
    }

    private Connection getConnection() throws Exception {
        return DriverManager.getConnection(jdbcUrl, user, password);
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
            plugin.getLogger().warning("Store queue poll failed: " + e.getMessage());
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
            plugin.getLogger().warning("Failed to claim queue command [" + id + "]: " + e.getMessage());
            return false;
        }
    }

    private void execute(int id, String command) {
        boolean success = false;
        try {
            success = Bukkit.dispatchCommand(Bukkit.getConsoleSender(), command);
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
            plugin.getLogger().warning("Failed to finalize queue command [" + id + "]: " + e.getMessage());
        }
    }
}
