package com.bwstatsapi.stats;

import com.andrei1058.bedwars.stats.StatsAPI;
import org.bukkit.Bukkit;
import org.bukkit.OfflinePlayer;

import java.util.*;
import java.util.stream.Collectors;

/**
 * Builds leaderboards from all known key holders' stats.
 * Supported stats: wins, losses, kills, finalKills, deaths, finalDeaths,
 *                  bedsBroken, gamesPlayed, fkdr, wlr, kdr, level, xp
 */
public class LeaderboardProvider {

    private final StatsProvider statsProvider;

    public LeaderboardProvider() {
        this.statsProvider = new StatsProvider();
    }

    public List<Map<String, Object>> getLeaderboard(String stat, int limit,
                                                     Set<UUID> candidates) {
        StatsAPI api = StatsAPI.getInstance();
        if (api == null) return Collections.emptyList();

        List<Map<String, Object>> entries = new ArrayList<>();

        for (UUID uuid : candidates) {
            Map<String, Object> playerStats = statsProvider.getStats(uuid);
            if (playerStats == null) continue;

            Object rawVal = playerStats.get(stat);
            if (rawVal == null) continue;

            double value;
            try { value = ((Number) rawVal).doubleValue(); }
            catch (ClassCastException e) { continue; }

            Map<String, Object> entry = new LinkedHashMap<>();
            OfflinePlayer op = Bukkit.getOfflinePlayer(uuid);
            entry.put("uuid",     uuid.toString());
            entry.put("username", op.getName() != null ? op.getName() : uuid.toString().substring(0, 8));
            entry.put("value",    rawVal);
            entries.add(entry);
        }

        // Sort descending
        entries.sort((a, b) -> {
            double va = ((Number) a.get("value")).doubleValue();
            double vb = ((Number) b.get("value")).doubleValue();
            return Double.compare(vb, va);
        });

        // Add rank position
        List<Map<String, Object>> ranked = entries.stream()
            .limit(limit)
            .collect(Collectors.toList());
        for (int i = 0; i < ranked.size(); i++) {
            ranked.get(i).put("rank", i + 1);
        }

        return ranked;
    }

    public static final Set<String> VALID_STATS = new LinkedHashSet<>(Arrays.asList(
        "wins", "losses", "kills", "finalKills", "deaths", "finalDeaths",
        "bedsBroken", "gamesPlayed", "fkdr", "wlr", "kdr", "level", "xp"
    ));
}
