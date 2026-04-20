package com.bwstatsapi.commands;

import com.bwstatsapi.BWStatsAPI;
import com.bwstatsapi.gui.AdminGui;
import com.bwstatsapi.gui.GuiListener;
import com.bwstatsapi.stats.ApiKeyManager;
import org.bukkit.ChatColor;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.command.TabCompleter;
import org.bukkit.entity.Player;

import java.sql.SQLException;
import java.text.SimpleDateFormat;
import java.util.*;

public class ApiKeyCommand implements CommandExecutor, TabCompleter {

    private static final SimpleDateFormat SDF = new SimpleDateFormat("yyyy-MM-dd HH:mm");
    private final BWStatsAPI plugin;
    private final GuiListener guiListener;

    public ApiKeyCommand(BWStatsAPI plugin, GuiListener guiListener) {
        this.plugin      = plugin;
        this.guiListener = guiListener;
    }

    @Override
    public boolean onCommand(CommandSender sender, Command cmd, String label, String[] args) {
        if (!(sender instanceof Player)) {
            sender.sendMessage(ChatColor.RED + "Only players can use this command.");
            return true;
        }

        Player player = (Player) sender;

        if (!player.hasPermission("bwstatsapi.use")) {
            player.sendMessage(color(msg("no-permission")));
            return true;
        }

        if (args.length == 0) { sendHelp(player, label); return true; }

        ApiKeyManager mgr = plugin.getApiKeyManager();

        switch (args[0].toLowerCase()) {

            // ── /apikey create ──────────────────────────────────
            case "create": {
                if (mgr.hasKey(player.getUniqueId())) {
                    player.sendMessage(color(msg("already-has-key")));
                    return true;
                }
                try {
                    String key = mgr.createKey(player.getUniqueId());
                    player.sendMessage(color(msg("key-created").replace("%key%", key)));
                    sendTutorial(player, key);
                } catch (SQLException e) {
                    player.sendMessage(ChatColor.RED + "Database error – please contact an admin.");
                    plugin.getLogger().severe("Failed to create API key: " + e.getMessage());
                }
                break;
            }

            // ── /apikey revoke ──────────────────────────────────
            case "revoke": {
                try {
                    boolean removed = mgr.revokeKey(player.getUniqueId());
                    player.sendMessage(color(removed ? msg("key-revoked") : msg("no-key")));
                } catch (SQLException e) {
                    player.sendMessage(ChatColor.RED + "Database error – please contact an admin.");
                    plugin.getLogger().severe("Failed to revoke API key: " + e.getMessage());
                }
                break;
            }

            // ── /apikey info ─────────────────────────────────────
            case "info": {
                String key = mgr.getKey(player.getUniqueId());
                if (key == null) {
                    player.sendMessage(color(msg("no-key")));
                } else {
                    int rateLimit   = mgr.getRateLimit(player.getUniqueId());
                    int effectiveLimit = rateLimit >= 0 ? rateLimit : plugin.getConfig().getInt("rate-limit", 60);
                    int thisMin     = mgr.getRequestsThisMinute(key);
                    long total      = mgr.getTotalRequests(player.getUniqueId());
                    long lastUsed   = mgr.getLastUsed(player.getUniqueId());
                    long created    = mgr.getCreatedAt(player.getUniqueId());

                    player.sendMessage(ChatColor.GOLD + "━━━━ Your API Key ━━━━");
                    player.sendMessage(ChatColor.GRAY  + "Key:         " + ChatColor.AQUA  + key);
                    player.sendMessage(ChatColor.GRAY  + "Created:     " + ChatColor.WHITE + (created == 0 ? "N/A" : SDF.format(new Date(created * 1000L))));
                    player.sendMessage(ChatColor.GRAY  + "This minute: " + ChatColor.WHITE + thisMin + " / " + (effectiveLimit == 0 ? "∞" : effectiveLimit));
                    player.sendMessage(ChatColor.GRAY  + "Total reqs:  " + ChatColor.WHITE + total);
                    player.sendMessage(ChatColor.GRAY  + "Last used:   " + ChatColor.WHITE + (lastUsed == 0 ? "Never" : SDF.format(new Date(lastUsed))));
                    player.sendMessage(ChatColor.GOLD  + "━━━━━━━━━━━━━━━━━━━━━");
                }
                break;
            }

            // ── /apikey admin ─────────────────────────────────────
            case "admin": {
                if (!player.hasPermission("bwstatsapi.admin")) {
                    player.sendMessage(color(msg("no-permission")));
                    return true;
                }
                guiListener.getPageMap().put(player.getUniqueId(), 0);
                AdminGui.openList(player, 0);
                break;
            }

            default:
                sendHelp(player, label);
        }

        return true;
    }

    @Override
    public List<String> onTabComplete(CommandSender sender, Command cmd, String alias, String[] args) {
        if (args.length == 1) {
            List<String> options = new ArrayList<>(Arrays.asList("create", "revoke", "info"));
            if (sender instanceof Player && ((Player) sender).hasPermission("bwstatsapi.admin")) {
                options.add("admin");
            }
            return options;
        }
        return Collections.emptyList();
    }

    private void sendHelp(Player p, String label) {
        p.sendMessage(ChatColor.GOLD + "━━━━ BWStatsAPI ━━━━");
        p.sendMessage(ChatColor.YELLOW + "/" + label + " create " + ChatColor.GRAY + "– Create your API key");
        p.sendMessage(ChatColor.YELLOW + "/" + label + " revoke " + ChatColor.GRAY + "– Delete your API key");
        p.sendMessage(ChatColor.YELLOW + "/" + label + " info   " + ChatColor.GRAY + "– Show your key & usage stats");
        if (p.hasPermission("bwstatsapi.admin")) {
            p.sendMessage(ChatColor.YELLOW + "/" + label + " admin  " + ChatColor.GRAY + "– Open admin GUI");
        }
    }

    private void sendTutorial(Player p, String key) {
        int port = plugin.getConfig().getInt("http-port", 7070);
        p.sendMessage("");
        p.sendMessage(ChatColor.GOLD + "━━━━ How to use your API key ━━━━");
        p.sendMessage(ChatColor.GRAY + "Your key: " + ChatColor.GREEN + key);
        p.sendMessage(ChatColor.GRAY + "Example: " + ChatColor.AQUA + "curl http://YOUR_IP:" + port + "/api/v1/player/NAME?apikey=" + key);
        p.sendMessage(ChatColor.GOLD + "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    }

    private String msg(String key) {
        return plugin.getConfig().getString("messages." + key, "&c(missing: " + key + ")");
    }

    private static String color(String s) {
        return org.bukkit.ChatColor.translateAlternateColorCodes('&', s);
    }
}
