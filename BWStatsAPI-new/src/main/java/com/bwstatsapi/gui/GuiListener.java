package com.bwstatsapi.gui;

import com.bwstatsapi.BWStatsAPI;
import com.bwstatsapi.stats.ApiKeyManager;
import org.bukkit.Bukkit;
import org.bukkit.ChatColor;
import org.bukkit.OfflinePlayer;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.inventory.InventoryClickEvent;
import org.bukkit.event.player.AsyncPlayerChatEvent;
import org.bukkit.inventory.ItemStack;

import java.sql.SQLException;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

public class GuiListener implements Listener {

    // Modes for pending chat input
    private enum InputMode { RATE_LIMIT, SEARCH }

    private final Map<UUID, UUID>      awaitingRateLimit = new ConcurrentHashMap<>();
    private final Map<UUID, InputMode> awaitingInput     = new ConcurrentHashMap<>();
    private final Map<UUID, Integer>   pageMap           = new ConcurrentHashMap<>();

    @EventHandler
    public void onInventoryClick(InventoryClickEvent e) {
        if (!(e.getWhoClicked() instanceof Player)) return;
        Player admin = (Player) e.getWhoClicked();
        String title = e.getView().getTitle();
        ItemStack clicked = e.getCurrentItem();

        // ── Player list ────────────────────────────────────────
        if (title.equals(AdminGui.LIST_TITLE)) {
            e.setCancelled(true);
            if (clicked == null || clicked.getType().name().equals("AIR")) return;
            int slot = e.getRawSlot();

            if (slot == 45) { // prev
                int p = pageMap.getOrDefault(admin.getUniqueId(), 0);
                if (p > 0) { pageMap.put(admin.getUniqueId(), p - 1); AdminGui.openList(admin, p - 1); }
                return;
            }
            if (slot == 53) { // next
                int p = pageMap.getOrDefault(admin.getUniqueId(), 0);
                pageMap.put(admin.getUniqueId(), p + 1); AdminGui.openList(admin, p + 1);
                return;
            }
            if (slot == 48) { // search
                admin.closeInventory();
                awaitingInput.put(admin.getUniqueId(), InputMode.SEARCH);
                admin.sendMessage(ChatColor.YELLOW + "Type the player name to search, or " + ChatColor.WHITE + "cancel" + ChatColor.YELLOW + " to abort.");
                return;
            }
            if (slot == 49) { // server stats
                AdminGui.openServerStats(admin);
                return;
            }
            if (slot == 46) return; // page info

            // Click on player head
            if (clicked.hasItemMeta()) {
                String rawName = ChatColor.stripColor(clicked.getItemMeta().getDisplayName())
                    .replace(" ●", "").replace(" ○", "").trim();
                @SuppressWarnings("deprecation")
                OfflinePlayer op = Bukkit.getOfflinePlayer(rawName);
                if (op != null) AdminGui.openDetail(admin, op.getUniqueId());
            }
            return;
        }

        // ── Detail view ────────────────────────────────────────
        if (title.startsWith(AdminGui.DETAIL_TITLE)) {
            e.setCancelled(true);
            if (clicked == null || clicked.getType().name().equals("AIR")) return;

            String playerName = ChatColor.stripColor(title.substring(AdminGui.DETAIL_TITLE.length())).trim();
            @SuppressWarnings("deprecation")
            OfflinePlayer target = Bukkit.getOfflinePlayer(playerName);
            if (target == null) return;
            UUID targetUuid = target.getUniqueId();
            ApiKeyManager mgr = BWStatsAPI.getInstance().getApiKeyManager();
            int slot = e.getRawSlot();

            if (slot == AdminGui.SLOT_COPY_KEY && mgr.hasKey(targetUuid)) {
                String k = mgr.getKey(targetUuid);
                admin.sendMessage(ChatColor.GOLD + "━━ Key for " + playerName + " ━━");
                admin.sendMessage(ChatColor.AQUA + k);
                admin.sendMessage(ChatColor.GOLD + "━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
                return;
            }
            if (slot == AdminGui.SLOT_BAN && !mgr.isBanned(targetUuid)) {
                try { mgr.setBanned(targetUuid, true);
                    admin.sendMessage(ChatColor.RED + "Banned API access for " + playerName + ".");
                    AdminGui.openDetail(admin, targetUuid);
                } catch (SQLException ex) { admin.sendMessage(ChatColor.RED + "DB error: " + ex.getMessage()); }
                return;
            }
            if (slot == AdminGui.SLOT_UNBAN && mgr.isBanned(targetUuid)) {
                try { mgr.setBanned(targetUuid, false);
                    admin.sendMessage(ChatColor.GREEN + "Unbanned API access for " + playerName + ".");
                    AdminGui.openDetail(admin, targetUuid);
                } catch (SQLException ex) { admin.sendMessage(ChatColor.RED + "DB error: " + ex.getMessage()); }
                return;
            }
            if (slot == AdminGui.SLOT_REVOKE && mgr.hasKey(targetUuid)) {
                try { mgr.revokeKey(targetUuid);
                    admin.sendMessage(ChatColor.RED + "Revoked API key for " + playerName + ".");
                    AdminGui.openDetail(admin, targetUuid);
                } catch (SQLException ex) { admin.sendMessage(ChatColor.RED + "DB error: " + ex.getMessage()); }
                return;
            }
            if (slot == AdminGui.SLOT_RATE_LIMIT) {
                admin.closeInventory();
                awaitingRateLimit.put(admin.getUniqueId(), targetUuid);
                awaitingInput.put(admin.getUniqueId(), InputMode.RATE_LIMIT);
                admin.sendMessage(ChatColor.YELLOW + "Type the new rate limit for " + ChatColor.WHITE + playerName + ChatColor.YELLOW + ".");
                admin.sendMessage(ChatColor.GRAY + "Number = requests/min | " + ChatColor.WHITE + "reset" + ChatColor.GRAY + " = global | " + ChatColor.WHITE + "cancel" + ChatColor.GRAY + " = abort");
                return;
            }
            if (slot == AdminGui.SLOT_CREATE && !mgr.hasKey(targetUuid)) {
                try { String key = mgr.createKey(targetUuid);
                    admin.sendMessage(ChatColor.GREEN + "Created key for " + playerName + ": " + ChatColor.AQUA + key);
                    Player online = Bukkit.getPlayer(targetUuid);
                    if (online != null) online.sendMessage(ChatColor.GREEN + "An admin created an API key for you: " + ChatColor.AQUA + key);
                    AdminGui.openDetail(admin, targetUuid);
                } catch (SQLException ex) { admin.sendMessage(ChatColor.RED + "DB error: " + ex.getMessage()); }
                return;
            }
            if (slot == AdminGui.SLOT_BACK) {
                AdminGui.openList(admin, pageMap.getOrDefault(admin.getUniqueId(), 0));
            }
            return;
        }

        // ── Server stats ───────────────────────────────────────
        if (title.equals(AdminGui.STATS_TITLE)) {
            e.setCancelled(true);
            if (clicked == null || clicked.getType().name().equals("AIR")) return;
            if (e.getRawSlot() == 22) AdminGui.openList(admin, pageMap.getOrDefault(admin.getUniqueId(), 0));
        }
    }

    @EventHandler(priority = EventPriority.LOWEST)
    public void onChat(AsyncPlayerChatEvent e) {
        Player admin = e.getPlayer();
        InputMode mode = awaitingInput.get(admin.getUniqueId());
        if (mode == null) return;

        e.setCancelled(true);
        String input = ChatColor.stripColor(e.getMessage()).trim();
        String lower = input.toLowerCase();

        // ── Search mode ────────────────────────────────────────
        if (mode == InputMode.SEARCH) {
            awaitingInput.remove(admin.getUniqueId());
            if (lower.equals("cancel")) {
                admin.sendMessage(ChatColor.GRAY + "Cancelled.");
                Bukkit.getScheduler().runTask(BWStatsAPI.getInstance(),
                    () -> AdminGui.openList(admin, pageMap.getOrDefault(admin.getUniqueId(), 0)));
                return;
            }
            Bukkit.getScheduler().runTask(BWStatsAPI.getInstance(), () -> {
                @SuppressWarnings("deprecation")
                OfflinePlayer op = Bukkit.getOfflinePlayer(input);
                ApiKeyManager mgr = BWStatsAPI.getInstance().getApiKeyManager();
                if (op == null || !mgr.hasKey(op.getUniqueId())) {
                    admin.sendMessage(ChatColor.RED + "No API key found for player \"" + input + "\".");
                    AdminGui.openList(admin, pageMap.getOrDefault(admin.getUniqueId(), 0));
                } else {
                    AdminGui.openDetail(admin, op.getUniqueId());
                }
            });
            return;
        }

        // ── Rate limit mode ────────────────────────────────────
        if (mode == InputMode.RATE_LIMIT) {
            UUID targetUuid = awaitingRateLimit.get(admin.getUniqueId());
            if (targetUuid == null) { awaitingInput.remove(admin.getUniqueId()); return; }

            if (lower.equals("cancel")) {
                awaitingInput.remove(admin.getUniqueId());
                awaitingRateLimit.remove(admin.getUniqueId());
                admin.sendMessage(ChatColor.GRAY + "Cancelled.");
                Bukkit.getScheduler().runTask(BWStatsAPI.getInstance(), () -> AdminGui.openDetail(admin, targetUuid));
                return;
            }

            ApiKeyManager mgr = BWStatsAPI.getInstance().getApiKeyManager();

            if (lower.equals("reset")) {
                awaitingInput.remove(admin.getUniqueId());
                awaitingRateLimit.remove(admin.getUniqueId());
                Bukkit.getScheduler().runTask(BWStatsAPI.getInstance(), () -> {
                    try { mgr.setRateLimit(targetUuid, -1);
                        admin.sendMessage(ChatColor.GREEN + "Rate limit reset to global default.");
                        AdminGui.openDetail(admin, targetUuid);
                    } catch (SQLException ex) { admin.sendMessage(ChatColor.RED + "DB error: " + ex.getMessage()); }
                });
                return;
            }

            try {
                int limit = Integer.parseInt(lower);
                if (limit < 0) { admin.sendMessage(ChatColor.RED + "Must be 0 or higher. Try again or type cancel."); return; }
                awaitingInput.remove(admin.getUniqueId());
                awaitingRateLimit.remove(admin.getUniqueId());
                Bukkit.getScheduler().runTask(BWStatsAPI.getInstance(), () -> {
                    try { mgr.setRateLimit(targetUuid, limit);
                        admin.sendMessage(ChatColor.GREEN + "Rate limit set to " + limit + "/min.");
                        AdminGui.openDetail(admin, targetUuid);
                    } catch (SQLException ex) { admin.sendMessage(ChatColor.RED + "DB error: " + ex.getMessage()); }
                });
            } catch (NumberFormatException ex) {
                admin.sendMessage(ChatColor.RED + "Invalid: \"" + input + "\". Type a number, reset, or cancel.");
            }
        }
    }

    public Map<UUID, Integer> getPageMap() { return pageMap; }
}
