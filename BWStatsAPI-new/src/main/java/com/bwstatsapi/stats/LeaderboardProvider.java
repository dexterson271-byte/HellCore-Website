package com.bwstatsapi.stats;

import org.bukkit.Bukkit;
import java.io.File;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.util.*;

public class LeaderboardProvider {

    private static final String DB_PATH = "plugins/BedWars1058/database.db";

    public LeaderboardProvider() {}

    public List<Map<String, Object>> getLeaderboard(String stat, int limit, Set<UUID> candidates) {
        List<Map<String, Object>> entries = new ArrayList<>();
        File dbFile = new File(DB_PATH);
        if (!dbFile.exists()) {
            return entries;
        }

        String orderBy = mapStatToColumn(stat);
        if (orderBy == null) return entries;

        try (Connection conn = DriverManager.getConnection("jdbc:sqlite:" + dbFile.getAbsolutePath());
             PreparedStatement ps = conn.prepareStatement("SELECT uuid, name, wins, kills, final_kills, deaths, final_deaths, beds_destroyed, games_played FROM global_stats ORDER BY " + orderBy + " DESC LIMIT ?")) {
            
            ps.setInt(1, limit);
            
            try (ResultSet rs = ps.executeQuery()) {
                int rank = 1;
                while (rs.next()) {
                    Map<String, Object> entry = new LinkedHashMap<>();
                    entry.put("uuid", rs.getString("uuid"));
                    entry.put("username", rs.getString("name"));
                    entry.put("wins", rs.getInt("wins"));
                    entry.put("kills", rs.getInt("kills"));
                    entry.put("final_kills", rs.getInt("final_kills"));
                    entry.put("deaths", rs.getInt("deaths"));
                    entry.put("final_deaths", rs.getInt("final_deaths"));
                    entry.put("beds_destroyed", rs.getInt("beds_destroyed"));
                    entry.put("games_played", rs.getInt("games_played"));
                    entry.put("is_bw1058", true);
                    entry.put("rank", rank++);
                    
                    // We also put "value" for compatibility
                    entry.put("value", rs.getObject(orderBy));
                    entries.add(entry);
                }
            }
        } catch (Exception e) {
            e.printStackTrace();
        }

        return entries;
    }

    private String mapStatToColumn(String stat) {
        switch (stat) {
            case "wins": return "wins";
            case "kills": return "kills";
            case "losses": return "losses";
            case "final_kills":
            case "finalKills": return "final_kills";
            case "deaths": return "deaths";
            case "final_deaths":
            case "finalDeaths": return "final_deaths";
            case "bedsBroken": 
            case "beds_destroyed": return "beds_destroyed";
            case "gamesPlayed": return "games_played";
            default: return null;
        }
    }

    public static final Set<String> VALID_STATS = new LinkedHashSet<>(Arrays.asList(
        "wins", "losses", "kills", "finalKills", "final_kills", "deaths", "finalDeaths", "final_deaths",
        "bedsBroken", "beds_destroyed", "gamesPlayed"
    ));
}
