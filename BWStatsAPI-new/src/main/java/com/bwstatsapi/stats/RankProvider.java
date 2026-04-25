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
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

public class RankProvider {

    private static boolean available = false;

    private static final long CACHE_TTL_MS = 60_000L;
    private static final ConcurrentHashMap<UUID, CachedRank> CACHE = new ConcurrentHashMap<>();

    private static final class CachedRank {
        final long expiresAt;
        final Map<String, Object> data;
        CachedRank(Map<String, Object> data) {
            this.data = data;
            this.expiresAt = System.currentTimeMillis() + CACHE_TTL_MS;
        }
    }

    public static void init() {
        available = Bukkit.getPluginManager().getPlugin("LuckPerms") != null;
    }

    public static boolean isAvailable() { return available; }

    public Map<String, Object> getRankInfo(UUID uuid) {
        if (!available) return null;

        CachedRank cached = CACHE.get(uuid);
        if (cached != null && cached.expiresAt > System.currentTimeMillis()) {
            return cached.data;
        }

        try {
            LuckPerms lp = LuckPermsProvider.get();

            // Try in-memory cache first (online players)
            User user = lp.getUserManager().getUser(uuid);

            if (user == null) {
                CompletableFuture<User> future = lp.getUserManager().loadUser(uuid);
                try {
                    user = future.get(2, TimeUnit.SECONDS);
                } catch (TimeoutException te) {
                    return null;
                }
            }

            if (user == null) return null;

            CachedMetaData meta = user.getCachedData().getMetaData();

            Map<String, Object> rank = new LinkedHashMap<>();
            rank.put("primaryGroup", user.getPrimaryGroup());
            rank.put("prefix",       meta.getPrefix() != null  ? stripColor(meta.getPrefix())  : "");
            rank.put("prefixRaw",    meta.getPrefix() != null  ? meta.getPrefix()  : "");
            rank.put("suffix",       meta.getSuffix() != null  ? stripColor(meta.getSuffix())  : "");
            rank.put("suffixRaw",    meta.getSuffix() != null  ? meta.getSuffix()  : "");

            CACHE.put(uuid, new CachedRank(rank));
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
