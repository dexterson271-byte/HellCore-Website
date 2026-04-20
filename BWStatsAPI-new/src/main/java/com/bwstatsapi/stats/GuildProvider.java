package com.bwstatsapi.stats;

import me.leoo.guilds.bukkit.api.GuildsAPI;
import me.leoo.guilds.bukkit.api.objects.Guild;
import me.leoo.guilds.api.objects.level.LevelView;
import org.bukkit.Bukkit;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

/**
 * Fetches guild info for a player via the Guilds plugin API.
 * Returns null if the player is not in a guild or the plugin is not loaded.
 */
public class GuildProvider {

    private static boolean available = false;

    public static void init() {
        available = Bukkit.getPluginManager().getPlugin("Guilds") != null;
    }

    public static boolean isAvailable() { return available; }

    public Map<String, Object> getGuildInfo(UUID playerUuid) {
        if (!available) return null;
        try {
            Guild guild = GuildsAPI.getGuildByPlayer(playerUuid);
            if (guild == null) return null;

            Map<String, Object> data = new LinkedHashMap<>();
            data.put("name",       guild.getName());
            data.put("tag",        guild.getFixedTag());
            data.put("leaderUuid", guild.getLeaderUuid() != null ? guild.getLeaderUuid().toString() : null);
            data.put("memberCount", guild.getMembersView() != null ? guild.getMembersView().size() : 0);
            data.put("maxMembers", guild.getMaxMembers());

            // Level info
            LevelView level = guild.getLevel();
            if (level != null) {
                Map<String, Object> lvl = new LinkedHashMap<>();
                lvl.put("level",    level.getLevel());
                lvl.put("xp",       level.getXp());
                lvl.put("nextCost", level.getNextCost());
                data.put("level", lvl);
            }

            // Player's rank in guild
            try {
                me.leoo.guilds.bukkit.api.objects.GuildRank rank = guild.getRank(playerUuid);
                if (rank != null) data.put("playerRank", rank.getName());
            } catch (Exception ignored) {}

            return data;
        } catch (Exception e) {
            return null;
        }
    }
}
