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

            // Hook into BedWars1058 if present
            if (Bukkit.getPluginManager().isPluginEnabled("BedWars1058")) {
                try {
                    com.andrei1058.bedwars.api.BedWars bwApi = Bukkit.getServicesManager().load(com.andrei1058.bedwars.api.BedWars.class);
                    if (bwApi != null) {
                        arenas = bwApi.getArenaUtil().getArenas().size();
                        // Count players in "STARTING" or "PLAYING" states
                        for (com.andrei1058.bedwars.api.arena.IArena arena : bwApi.getArenaUtil().getArenas()) {
                             if (arena.getStatus() == com.andrei1058.bedwars.api.arena.GameState.starting || 
                                 arena.getStatus() == com.andrei1058.bedwars.api.arena.GameState.playing) {
                                 inGame += arena.getPlayers().size();
                             }
                        }
                    }
                } catch (Exception ignored) {}
            }
            
            // Build metrics URL with new arena/ingame data
            String metricsUrl = apiUrl.replace("/verify/confirm", "/metrics/update") 
                    + "?online=" + online 
                    + "&max=" + max 
                    + "&server=" + serverName
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
            String resultMessage;
            try {
                String requestUrl = apiUrl + "?code=" + code + "&uuid=" + player.getUniqueId().toString() + "&username=" + player.getName();
                URL url = new URL(requestUrl);
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("GET");
                conn.setConnectTimeout(5000);
                conn.setReadTimeout(5000);

                int responseCode = conn.getResponseCode();
                if (responseCode == 200) {
                    resultMessage = prefix + ChatColor.translateAlternateColorCodes('&', getConfig().getString("messages.success"));
                } else {
                    resultMessage = prefix + ChatColor.translateAlternateColorCodes('&', getConfig().getString("messages.error"));
                }
                conn.disconnect();
            } catch (Exception e) {
                resultMessage = prefix + ChatColor.RED + "An error occurred while connecting to the website.";
                getLogger().warning("Verify request failed: " + e.getMessage());
            }
            final String finalMessage = resultMessage;
            Bukkit.getScheduler().runTask(this, () -> {
                if (player.isOnline()) player.sendMessage(finalMessage);
            });
        });

        return true;
    }
}
