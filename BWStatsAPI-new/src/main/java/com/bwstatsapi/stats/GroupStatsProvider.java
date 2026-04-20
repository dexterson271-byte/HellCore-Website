package com.bwstatsapi.stats;

import me.infinity.groupstats.core.GroupProfile;
import me.infinity.groupstats.core.GroupStatsPlugin;
import me.infinity.groupstats.api.GroupNode;
import org.bukkit.Bukkit;

import java.util.*;

/**
 * Fetches per-group and overall stats from BedWars1058-GroupStats.
 * GroupProfile holds a Map<String, GroupNode> where the key is the group name
 * (e.g. "solo", "duo", "3v3v3v3", "4v4v4v4") and GroupNode holds stats.
 */
public class GroupStatsProvider {

    private static boolean available = false;

    public static void init() {
        available = Bukkit.getPluginManager().getPlugin("BedWars1058-GroupStats") != null;
    }

    public static boolean isAvailable() { return available; }

    /**
     * Returns a map of groupName → stats for the player.
     * Also includes an "overall" key summing all groups.
     */
    public Map<String, Object> getGroupStats(UUID uuid) {
        if (!available) return null;
        try {
            GroupStatsPlugin plugin = (GroupStatsPlugin) Bukkit.getPluginManager()
                .getPlugin("BedWars1058-GroupStats");
            if (plugin == null) return null;

            // Try cache first, then fetch from DB
            GroupProfile profile = plugin.getGroupManager().getGroupProfileCache().get(uuid);
            if (profile == null) {
                profile = plugin.getGroupManager().fetchLoad(uuid);
            }
            if (profile == null) return null;

            Map<String, GroupNode> groupStats = profile.getGroupStatistics();
            if (groupStats == null || groupStats.isEmpty()) return null;

            Map<String, Object> result = new LinkedHashMap<>();

            // Per-group stats
            Map<String, Object> groups = new LinkedHashMap<>();
            int totalWins = 0, totalLosses = 0, totalKills = 0, totalFinalKills = 0,
                totalDeaths = 0, totalFinalDeaths = 0, totalBeds = 0,
                totalGames = 0, totalWinstreak = 0, totalHighestWinstreak = 0;

            for (Map.Entry<String, GroupNode> entry : groupStats.entrySet()) {
                String    groupName = entry.getKey();
                GroupNode node      = entry.getValue();

                Map<String, Object> g = new LinkedHashMap<>();
                g.put("wins",               node.getWins());
                g.put("losses",             node.getLosses());
                g.put("kills",              node.getKills());
                g.put("finalKills",         node.getFinalKills());
                g.put("deaths",             node.getDeaths());
                g.put("finalDeaths",        node.getFinalDeaths());
                g.put("bedsBroken",         node.getBedsBroken());
                g.put("gamesPlayed",        node.getGamesPlayed());
                g.put("winstreak",          node.getWinstreak());
                g.put("highestWinstreak",   node.getHighestWinstreak());
                g.put("fkdr", node.getFinalDeaths() == 0
                    ? (double) node.getFinalKills()
                    : round((double) node.getFinalKills() / node.getFinalDeaths()));
                g.put("wlr", node.getLosses() == 0
                    ? (double) node.getWins()
                    : round((double) node.getWins() / node.getLosses()));
                g.put("kdr", node.getDeaths() == 0
                    ? (double) node.getKills()
                    : round((double) node.getKills() / node.getDeaths()));

                groups.put(groupName, g);

                totalWins             += node.getWins();
                totalLosses           += node.getLosses();
                totalKills            += node.getKills();
                totalFinalKills       += node.getFinalKills();
                totalDeaths           += node.getDeaths();
                totalFinalDeaths      += node.getFinalDeaths();
                totalBeds             += node.getBedsBroken();
                totalGames            += node.getGamesPlayed();
                totalWinstreak        = Math.max(totalWinstreak, node.getWinstreak());
                totalHighestWinstreak = Math.max(totalHighestWinstreak, node.getHighestWinstreak());
            }

            result.put("groups", groups);

            // Overall stats (sum of all groups)
            Map<String, Object> overall = new LinkedHashMap<>();
            overall.put("wins",             totalWins);
            overall.put("losses",           totalLosses);
            overall.put("kills",            totalKills);
            overall.put("finalKills",       totalFinalKills);
            overall.put("deaths",           totalDeaths);
            overall.put("finalDeaths",      totalFinalDeaths);
            overall.put("bedsBroken",       totalBeds);
            overall.put("gamesPlayed",      totalGames);
            overall.put("winstreak",        totalWinstreak);
            overall.put("highestWinstreak", totalHighestWinstreak);
            overall.put("fkdr", totalFinalDeaths == 0
                ? (double) totalFinalKills
                : round((double) totalFinalKills / totalFinalDeaths));
            overall.put("wlr", totalLosses == 0
                ? (double) totalWins
                : round((double) totalWins / totalLosses));
            overall.put("kdr", totalDeaths == 0
                ? (double) totalKills
                : round((double) totalKills / totalDeaths));
            result.put("overall", overall);

            return result;
        } catch (Exception e) {
            return null;
        }
    }

    private static double round(double v) { return Math.round(v * 100.0) / 100.0; }
}
