package com.bwstatsapi.gui;

import com.bwstatsapi.BWStatsAPI;
import com.bwstatsapi.stats.ApiKeyManager;
import org.bukkit.Bukkit;
import org.bukkit.ChatColor;
import org.bukkit.Material;
import org.bukkit.OfflinePlayer;
import org.bukkit.entity.Player;
import org.bukkit.inventory.Inventory;
import org.bukkit.inventory.ItemStack;
import org.bukkit.inventory.meta.ItemMeta;
import org.bukkit.inventory.meta.SkullMeta;

import java.text.SimpleDateFormat;
import java.util.*;

public class AdminGui {

    public static final int SLOT_KEY_INFO   = 13;
    public static final int SLOT_REVOKE     = 29;
    public static final int SLOT_RATE_LIMIT = 31;
    public static final int SLOT_CREATE     = 33;
    public static final int SLOT_BACK       = 49;
    public static final int SLOT_COPY_KEY  = 7;
    public static final int SLOT_BAN        = 11;
    public static final int SLOT_UNBAN      = 15;

    public static final String LIST_TITLE    = ChatColor.DARK_AQUA + "API Key Manager";
    public static final String DETAIL_TITLE  = ChatColor.DARK_AQUA + "Player: ";
    public static final String STATS_TITLE   = ChatColor.DARK_AQUA + "Server Stats";
    public static final String SEARCH_TITLE  = ChatColor.DARK_AQUA + "Search Player";

    private static final SimpleDateFormat SDF = new SimpleDateFormat("yyyy-MM-dd HH:mm");

    // ── Open player list ───────────────────────────────────────────────────

    public static void openList(Player admin, int page) {
        ApiKeyManager mgr = BWStatsAPI.getInstance().getApiKeyManager();
        List<UUID> owners = new ArrayList<>(mgr.getAllKeyOwners());

        int perPage = 36; // 4 rows for players, leaving row 5 for controls
        int totalPages = Math.max(1, (int) Math.ceil(owners.size() / (double) perPage));
        page = Math.max(0, Math.min(page, totalPages - 1));

        Inventory inv = Bukkit.createInventory(null, 54, LIST_TITLE);

        // Fill player heads
        int start = page * perPage;
        for (int i = start; i < Math.min(start + perPage, owners.size()); i++) {
            UUID uuid = owners.get(i);
            OfflinePlayer op = Bukkit.getOfflinePlayer(uuid);
            String name = op.getName() != null ? op.getName() : uuid.toString().substring(0, 8);
            boolean online = Bukkit.getPlayer(uuid) != null;

            ItemStack head = new ItemStack(Material.SKULL_ITEM, 1, (short) 3);
            SkullMeta meta = (SkullMeta) head.getItemMeta();
            meta.setOwner(name);
            meta.setDisplayName((online ? ChatColor.GREEN : ChatColor.GRAY) + name
                + (online ? " ●" : " ○"));
            List<String> lore = new ArrayList<>();
            lore.add(ChatColor.GRAY + "Status: " + (online ? ChatColor.GREEN + "Online" : ChatColor.RED + "Offline"));
            lore.add(ChatColor.GRAY + "Total requests: " + ChatColor.WHITE + mgr.getTotalRequests(uuid));
            long lastUsed = mgr.getLastUsed(uuid);
            lore.add(ChatColor.GRAY + "Last used: " + ChatColor.WHITE + (lastUsed == 0 ? "Never" : SDF.format(new Date(lastUsed))));
            lore.add(ChatColor.GRAY + "Rate limit: " + ChatColor.WHITE + rateLimitLabel(mgr, uuid));
            lore.add("");
            lore.add(ChatColor.YELLOW + "Click to manage");
            meta.setLore(lore);
            head.setItemMeta(meta);
            inv.setItem(i - start, head);
        }

        // Bottom row controls
        if (page > 0)
            inv.setItem(45, makeItem(Material.ARROW, ChatColor.GREEN + "◀ Previous page", null));
        inv.setItem(46, makeItem(Material.WATCH, ChatColor.YELLOW + "Page " + (page + 1) + "/" + totalPages
            + "  (" + owners.size() + " keys)", null));
        inv.setItem(48, makeItem(Material.SIGN, ChatColor.AQUA + "Search by name", Collections.singletonList(ChatColor.GRAY + "Click to search a player")));
        inv.setItem(49, makeItem(Material.PAPER, ChatColor.WHITE + "Server Stats", Collections.singletonList(ChatColor.GRAY + "Click to view API stats")));
        if (page < totalPages - 1)
            inv.setItem(53, makeItem(Material.ARROW, ChatColor.GREEN + "Next page ▶", null));

        admin.openInventory(inv);
    }

    // ── Open detail view ───────────────────────────────────────────────────

    public static void openDetail(Player admin, UUID target) {
        ApiKeyManager mgr = BWStatsAPI.getInstance().getApiKeyManager();
        OfflinePlayer op = Bukkit.getOfflinePlayer(target);
        String name = op.getName() != null ? op.getName() : target.toString().substring(0, 8);
        boolean online = Bukkit.getPlayer(target) != null;
        boolean banned = mgr.isBanned(target);

        Inventory inv = Bukkit.createInventory(null, 54, DETAIL_TITLE + name);

        // Player head (slot 4)
        ItemStack head = new ItemStack(Material.SKULL_ITEM, 1, (short) 3);
        SkullMeta headMeta = (SkullMeta) head.getItemMeta();
        headMeta.setOwner(name);
        headMeta.setDisplayName(ChatColor.GOLD + name);
        List<String> headLore = new ArrayList<>();
        String key = mgr.getKey(target);
        headLore.add(ChatColor.GRAY + "UUID: " + ChatColor.WHITE + target);
        headLore.add(ChatColor.GRAY + "Key: " + ChatColor.AQUA + (key != null ? key : "None"));
        headLore.add(ChatColor.GRAY + "Status: " + (online ? ChatColor.GREEN + "Online" : ChatColor.RED + "Offline"));
        headLore.add(ChatColor.GRAY + "API access: " + (banned ? ChatColor.RED + "Banned" : ChatColor.GREEN + "Active"));
        long created = mgr.getCreatedAt(target);
        headLore.add(ChatColor.GRAY + "Created: " + ChatColor.WHITE + (created == 0 ? "N/A" : SDF.format(new Date(created * 1000L))));
        headMeta.setLore(headLore);
        head.setItemMeta(headMeta);
        inv.setItem(4, head);

        // Usage stats (slot 13)
        long total = mgr.getTotalRequests(target);
        long lastUsed = mgr.getLastUsed(target);
        int thisMin = key != null ? mgr.getRequestsThisMinute(key) : 0;
        int rateLimit = mgr.getRateLimit(target);
        int effectiveLimit = rateLimit >= 0 ? rateLimit : BWStatsAPI.getInstance().getConfig().getInt("rate-limit", 60);
        inv.setItem(SLOT_KEY_INFO, makeItem(Material.BOOK, ChatColor.AQUA + "Usage Stats", Arrays.asList(
            ChatColor.GRAY + "Total requests: " + ChatColor.WHITE + total,
            ChatColor.GRAY + "This minute: " + ChatColor.WHITE + thisMin + "/" + (effectiveLimit == 0 ? "∞" : effectiveLimit),
            ChatColor.GRAY + "Last used: " + ChatColor.WHITE + (lastUsed == 0 ? "Never" : SDF.format(new Date(lastUsed))),
            ChatColor.GRAY + "Rate limit: " + ChatColor.WHITE + rateLimitLabel(mgr, target)
        )));

        // Copy key button (slot 7)
        if (key != null) {
            inv.setItem(SLOT_COPY_KEY, makeItem(Material.NAME_TAG, ChatColor.AQUA + "Copy Key to Chat",
                Arrays.asList(ChatColor.GRAY + "Click to display the key in chat",
                    ChatColor.AQUA + (key.length() > 20 ? key.substring(0, 20) + "..." : key))));
        }

        // Ban/Unban (slots 11 and 15)
        if (banned) {
            inv.setItem(SLOT_BAN, makeItem(Material.BARRIER, ChatColor.DARK_GRAY + "Already banned", null));
            inv.setItem(SLOT_UNBAN, makeItem(Material.EMERALD, ChatColor.GREEN + "Unban API Access",
                Collections.singletonList(ChatColor.GRAY + "Re-enable API access for " + name)));
        } else {
            inv.setItem(SLOT_BAN, makeItem(Material.TNT, ChatColor.RED + "Ban API Access",
                Arrays.asList(ChatColor.GRAY + "Block " + name + "'s key from working.",
                    ChatColor.GRAY + "Key is kept but all requests are rejected.")));
            inv.setItem(SLOT_UNBAN, makeItem(Material.BARRIER, ChatColor.DARK_GRAY + "Not banned", null));
        }

        // Revoke (slot 29)
        if (key != null) {
            inv.setItem(SLOT_REVOKE, makeItem(Material.SHEARS, ChatColor.RED + "Revoke Key",
                Arrays.asList(ChatColor.GRAY + "Permanently deletes " + name + "'s API key.",
                    ChatColor.RED + "This cannot be undone!")));
        } else {
            inv.setItem(SLOT_REVOKE, makeItem(Material.BARRIER, ChatColor.DARK_GRAY + "No key to revoke", null));
        }

        // Set rate limit (slot 31)
        inv.setItem(SLOT_RATE_LIMIT, makeItem(Material.WATCH, ChatColor.YELLOW + "Set Rate Limit",
            Arrays.asList(
                ChatColor.GRAY + "Current: " + ChatColor.WHITE + rateLimitLabel(mgr, target),
                "",
                ChatColor.YELLOW + "Click → type in chat",
                ChatColor.GRAY + "Enter a number, 'reset', or 'cancel'"
            )));

        // Create key (slot 33)
        if (key == null) {
            inv.setItem(SLOT_CREATE, makeItem(Material.EMERALD, ChatColor.GREEN + "Create Key",
                Collections.singletonList(ChatColor.GRAY + "Generate a new API key for " + name)));
        } else {
            inv.setItem(SLOT_CREATE, makeItem(Material.BARRIER, ChatColor.DARK_GRAY + "Already has a key", null));
        }

        // Back (slot 49)
        inv.setItem(SLOT_BACK, makeItem(Material.ARROW, ChatColor.GRAY + "◀ Back to list", null));

        admin.openInventory(inv);
    }

    // ── Server stats screen ────────────────────────────────────────────────

    public static void openServerStats(Player admin) {
        ApiKeyManager mgr = BWStatsAPI.getInstance().getApiKeyManager();
        Inventory inv = Bukkit.createInventory(null, 27, STATS_TITLE);

        int totalKeys   = mgr.getAllKeyOwners().size();
        int bannedCount = mgr.getBannedCount();
        long totalReqs  = mgr.getTotalRequestsAllKeys();

        inv.setItem(10, makeItem(Material.EMERALD, ChatColor.GREEN + "Total API Keys",
            Arrays.asList(ChatColor.WHITE + "" + totalKeys + " keys issued")));

        inv.setItem(12, makeItem(Material.BOOK, ChatColor.AQUA + "Total Requests",
            Arrays.asList(ChatColor.WHITE + "" + totalReqs + " requests ever")));

        inv.setItem(14, makeItem(Material.TNT, ChatColor.RED + "Banned Keys",
            Arrays.asList(ChatColor.WHITE + "" + bannedCount + " keys banned")));

        int onlineWithKey = 0;
        for (UUID uuid : mgr.getAllKeyOwners()) {
            if (Bukkit.getPlayer(uuid) != null) onlineWithKey++;
        }
        inv.setItem(16, makeItem(Material.SKULL_ITEM, ChatColor.YELLOW + "Online Key Holders",
            Arrays.asList(ChatColor.WHITE + "" + onlineWithKey + " online right now")));

        inv.setItem(22, makeItem(Material.ARROW, ChatColor.GRAY + "◀ Back", null));

        admin.openInventory(inv);
    }

    // ── Helpers ────────────────────────────────────────────────────────────

    public static ItemStack makeItem(Material mat, String name, List<String> lore) {
        ItemStack item = new ItemStack(mat);
        ItemMeta meta = item.getItemMeta();
        meta.setDisplayName(name);
        if (lore != null) meta.setLore(lore);
        item.setItemMeta(meta);
        return item;
    }

    private static String rateLimitLabel(ApiKeyManager mgr, UUID uuid) {
        int rl = mgr.getRateLimit(uuid);
        if (rl < 0) {
            int global = BWStatsAPI.getInstance().getConfig().getInt("rate-limit", 60);
            return "Global (" + global + "/min)";
        }
        return rl == 0 ? "Unlimited" : rl + "/min";
    }
}
