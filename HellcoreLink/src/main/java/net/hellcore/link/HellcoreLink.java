package net.hellcore.link;

import org.bukkit.Bukkit;
import org.bukkit.ChatColor;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;
import org.bukkit.plugin.java.JavaPlugin;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.CompletableFuture;

public class HellcoreLink extends JavaPlugin implements CommandExecutor {

    private String apiUrl;
    private String prefix;

    @Override
    public void onEnable() {
        saveDefaultConfig();
        this.apiUrl = getConfig().getString("api-url");
        this.prefix = ChatColor.translateAlternateColorCodes('&', getConfig().getString("messages.prefix"));

        getCommand("verify").setExecutor(this);
        
        // Start Heartbeat/Metrics Task (runs every minute)
        Bukkit.getScheduler().runTaskTimerAsynchronously(this, this::sendMetrics, 20L * 10, 20L * 60);
        
        getLogger().info("HellcoreLink has been enabled with Metrics reporting!");
    }

    private void sendMetrics() {
        try {
            int online = Bukkit.getOnlinePlayers().size();
            int max = Bukkit.getMaxPlayers();
            String serverName = Bukkit.getServer().getName();
            
            int arenas = 0;
            int inGame = 0;

            // Hook into BedWars1058 via Reflection (safest way without compile-time dependency)
            if (Bukkit.getPluginManager().isPluginEnabled("BedWars1058")) {
                try {
                    Object bwApi = Bukkit.getServicesManager().load(Class.forName("com.andrei1058.bedwars.api.BedWars"));
                    if (bwApi != null) {
                        Object arenaUtil = bwApi.getClass().getMethod("getArenaUtil").invoke(bwApi);
                        java.util.List<?> arenaList = (java.util.List<?>) arenaUtil.getClass().getMethod("getArenas").invoke(arenaUtil);
                        
                        arenas = arenaList.size();
                        for (Object arena : arenaList) {
                            Object status = arena.getClass().getMethod("getStatus").invoke(arena);
                            String statusName = status.toString().toLowerCase();
                            if (statusName.equals("starting") || statusName.equals("playing")) {
                                java.util.List<?> players = (java.util.List<?>) arena.getClass().getMethod("getPlayers").invoke(arena);
                                inGame += players.size();
                            }
                        }
                    }
                } catch (Exception ignored) {}
            }
            
            // Build metrics URL
            String metricsUrl = apiUrl.replace("/verify/confirm", "/metrics/update") 
                    + "?online=" + online 
                    + "&max=" + max 
                    + "&server=" + java.net.URLEncoder.encode(serverName, "UTF-8")
                    + "&arenas=" + arenas
                    + "&ingame=" + inGame;
            
            URL url = new URL(metricsUrl);
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("GET");
            conn.setConnectTimeout(5000);
            conn.getResponseCode(); // Trigger the request
            conn.disconnect();
        } catch (Exception ignored) {}
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        if (!(sender instanceof Player)) {
            sender.sendMessage("This command is for players only.");
            return true;
        }

        Player player = (Player) sender;

        if (args.length != 1) {
            player.sendMessage(prefix + ChatColor.translateAlternateColorCodes('&', getConfig().getString("messages.usage")));
            return true;
        }

        String code = args[0];
        player.sendMessage(prefix + ChatColor.translateAlternateColorCodes('&', getConfig().getString("messages.verifying")));

        // Run HTTP request asynchronously to prevent server lag
        CompletableFuture.runAsync(() -> {
            try {
                String requestUrl = apiUrl + "?code=" + code + "&uuid=" + player.getUniqueId().toString() + "&username=" + player.getName();
                URL url = new URL(requestUrl);
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("GET");
                conn.setConnectTimeout(5000);
                conn.setReadTimeout(5000);

                int responseCode = conn.getResponseCode();
                if (responseCode == 200) {
                    player.sendMessage(prefix + ChatColor.translateAlternateColorCodes('&', getConfig().getString("messages.success")));
                } else {
                    player.sendMessage(prefix + ChatColor.translateAlternateColorCodes('&', getConfig().getString("messages.error")));
                }
                conn.disconnect();
            } catch (Exception e) {
                player.sendMessage(prefix + ChatColor.RED + "An error occurred while connecting to the website.");
                e.printStackTrace();
            }
        });

        return true;
    }
}
