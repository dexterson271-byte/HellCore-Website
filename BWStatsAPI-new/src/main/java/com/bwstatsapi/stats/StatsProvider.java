package com.bwstatsapi.stats;

import com.andrei1058.bedwars.api.BedWars;
import com.andrei1058.bedwars.api.arena.IArena;
import com.andrei1058.bedwars.stats.StatsAPI;
import com.bwstatsapi.BWStatsAPI;
import org.bukkit.Bukkit;
import org.bukkit.entity.Player;

import java.io.File;
import java.sql.*;
import java.util.*;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

public class StatsProvider {

    private static final String SHOP_DB_PATH = "plugins/BedWars1058/Cache/shop.db";

    private final RankProvider rankProvider = new RankProvider();

    private static volatile Connection shopConn;
    private static final Object SHOP_LOCK = new Object();

    public StatsProvider() {}

    public Map<String, Object> getStats(UUID uuid) {
        StatsAPI api = StatsAPI.getInstance();
        if (api == null) return null;

        int wins          = api.getPlayerWins(uuid);
        int kills         = api.getPlayerKills(uuid);
        int finalKills    = api.getPlayerFinalKills(uuid);
        int deaths        = api.getPlayerDeaths(uuid);
        int finalDeaths   = api.getPlayerFinalDeaths(uuid);
        int losses        = api.getPlayerLoses(uuid);
        int bedsDestroyed = api.getPlayerBedsDestroyed(uuid);
        int gamesPlayed   = api.getPlayerGamesPlayed(uuid);

        if (gamesPlayed == 0 && wins == 0 && kills == 0) return null;

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("uuid",        uuid.toString());
        data.put("kills",       kills);
        data.put("finalKills",  finalKills);
        data.put("deaths",      deaths);
        data.put("finalDeaths", finalDeaths);
        data.put("bedsBroken",  bedsDestroyed);
        data.put("wins",        wins);
        data.put("losses",      losses);
        data.put("gamesPlayed", gamesPlayed);

        data.put("kdr",  deaths      == 0 ? (double) kills      : round((double) kills      / deaths));
        data.put("fkdr", finalDeaths == 0 ? (double) finalKills : round((double) finalKills / finalDeaths));
        data.put("wlr",  losses      == 0 ? (double) wins       : round((double) wins       / losses));

        long firstPlay = 0L, lastPlay = 0L;
        try {
            Timestamp fp = api.getPlayerFirstPlay(uuid);
            Timestamp lp = api.getPlayerLastPlay(uuid);
            if (fp != null) firstPlay = fp.getTime();
            if (lp != null) lastPlay  = lp.getTime();
        } catch (Exception ignored) {}
        data.put("firstPlay", firstPlay);
        data.put("lastPlay",  lastPlay);

        // XP and level from shop.db
        long xp = 0L; int level = 1;
        try { long[] xl = readXpLevel(uuid); xp = xl[0]; level = (int) xl[1]; }
        catch (Exception ignored) {}
        data.put("xp",    xp);
        data.put("level", level);
        data.put("stars", level);

        // Online status
        Player onlinePlayer = Bukkit.getPlayer(uuid);
        boolean isOnline = onlinePlayer != null;
        data.put("isOnline", isOnline);
        data.put("lastSeen", lastPlay);

        if (isOnline && !Bukkit.isPrimaryThread()) {
            Map<String, Object> gameInfo = fetchCurrentGameSync(onlinePlayer);
            data.put("currentGame", gameInfo);
        } else if (isOnline) {
            data.put("currentGame", fetchCurrentGameUnchecked(onlinePlayer));
        } else {
            data.put("currentGame", null);
        }

        // Rank from LuckPerms
        if (RankProvider.isAvailable()) {
            data.put("rank", rankProvider.getRankInfo(uuid));
        }

        // Quick-buy placeholder
        Map<String, Object> qb = new LinkedHashMap<>();
        for (int i = 0; i < 9; i++) qb.put("slot_" + i, "empty");
        data.put("quickBuy", qb);

        return data;
    }

    private long[] readXpLevel(UUID uuid) throws SQLException {
        Connection c = openShop();
        if (c == null) return new long[]{0, 1};
        synchronized (SHOP_LOCK) {
            try (PreparedStatement ps = c.prepareStatement(
                    "SELECT xp, level FROM player_levels WHERE uuid = ?")) {
                ps.setString(1, uuid.toString());
                try (ResultSet rs = ps.executeQuery()) {
                    if (rs.next()) return new long[]{rs.getLong("xp"), rs.getLong("level")};
                }
            } catch (SQLException e) {
                try { c.close(); } catch (SQLException ignored) {}
                shopConn = null;
                throw e;
            }
        }
        return new long[]{0, 1};
    }

    private static Connection openShop() {
        Connection c = shopConn;
        if (c != null) return c;
        synchronized (SHOP_LOCK) {
            if (shopConn != null) return shopConn;
            File dbFile = new File(SHOP_DB_PATH);
            if (!dbFile.exists()) return null;
            try {
                shopConn = DriverManager.getConnection(
                    "jdbc:sqlite:" + dbFile.getAbsolutePath()
                        + "?journal_mode=WAL&busy_timeout=2000");
                return shopConn;
            } catch (SQLException e) {
                return null;
            }
        }
    }

    private Map<String, Object> fetchCurrentGameSync(Player onlinePlayer) {
        try {
            Future<Map<String, Object>> f = Bukkit.getScheduler().callSyncMethod(
                BWStatsAPI.getInstance(), () -> fetchCurrentGameUnchecked(onlinePlayer));
            return f.get(250, TimeUnit.MILLISECONDS);
        } catch (Exception ignored) {
            return null;
        }
    }

    private static Map<String, Object> fetchCurrentGameUnchecked(Player onlinePlayer) {
        try {
            BedWars bwApi = (BedWars) Bukkit.getServicesManager()
                .getRegistration(BedWars.class).getProvider();
            IArena arena = bwApi.getArenaUtil().getArenaByPlayer(onlinePlayer);
            if (arena == null) return null;
            Map<String, Object> gameInfo = new LinkedHashMap<>();
            gameInfo.put("arenaName",  arena.getArenaName());
            gameInfo.put("group",      arena.getGroup());
            gameInfo.put("state",      arena.getStatus().name());
            gameInfo.put("players",    arena.getPlayers().size());
            gameInfo.put("maxPlayers", arena.getMaxPlayers());
            return gameInfo;
        } catch (Exception ignored) {
            return null;
        }
    }

    private static double round(double v) { return Math.round(v * 100.0) / 100.0; }
}
