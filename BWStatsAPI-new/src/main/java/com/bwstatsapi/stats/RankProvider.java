package com.bwstatsapi.stats;

import net.luckperms.api.LuckPerms;
import net.luckperms.api.LuckPermsProvider;
import net.luckperms.api.cacheddata.CachedMetaData;
import net.luckperms.api.model.user.User;
import org.bukkit.Bukkit;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;

public class RankProvider {

    private static boolean available = false;

    public static void init() {
        available = Bukkit.getPluginManager().getPlugin("LuckPerms") != null;
    }

    public static boolean isAvailable() { return available; }

    public Map<String, Object> getRankInfo(UUID uuid) {
        if (!available) return null;
        try {
            LuckPerms lp = LuckPermsProvider.get();

            // Try in-memory cache first (online players)
            User user = lp.getUserManager().getUser(uuid);

            // If not loaded (offline player), load from storage
            if (user == null) {
                CompletableFuture<User> future = lp.getUserManager().loadUser(uuid);
                user = future.get(); // blocking but we're on a worker thread via HTTP
            }

            if (user == null) return null;

            CachedMetaData meta = user.getCachedData().getMetaData();

            Map<String, Object> rank = new LinkedHashMap<>();
            rank.put("primaryGroup", user.getPrimaryGroup());
            rank.put("prefix",       meta.getPrefix() != null  ? stripColor(meta.getPrefix())  : "");
            rank.put("prefixRaw",    meta.getPrefix() != null  ? meta.getPrefix()  : "");
            rank.put("suffix",       meta.getSuffix() != null  ? stripColor(meta.getSuffix())  : "");
            rank.put("suffixRaw",    meta.getSuffix() != null  ? meta.getSuffix()  : "");

            return rank;
        } catch (Exception e) {
            return null;
        }
    }

    /** Strip Minecraft color codes (&x and §x) */
    private static String stripColor(String s) {
        return s.replaceAll("[&§][0-9a-fk-orA-FK-OR]", "");
    }
}
