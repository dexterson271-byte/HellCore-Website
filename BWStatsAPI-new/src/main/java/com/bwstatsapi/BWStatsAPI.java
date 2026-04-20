package com.bwstatsapi;

import com.bwstatsapi.commands.ApiKeyCommand;
import com.bwstatsapi.gui.GuiListener;
import com.bwstatsapi.http.StatsHttpServer;
import com.bwstatsapi.stats.*;
import org.bukkit.plugin.java.JavaPlugin;

public class BWStatsAPI extends JavaPlugin {

    private static BWStatsAPI instance;
    private ApiKeyManager apiKeyManager;
    private StatsHttpServer httpServer;

    @Override
    public void onEnable() {
        instance = this;
        saveDefaultConfig();

        if (getServer().getPluginManager().getPlugin("BedWars1058") == null) {
            getLogger().severe("BedWars1058 not found – BWStatsAPI disabling!");
            getServer().getPluginManager().disablePlugin(this);
            return;
        }

        apiKeyManager = new ApiKeyManager(this);
        if (!apiKeyManager.init()) {
            getLogger().severe("Failed to initialise SQLite database – disabling.");
            getServer().getPluginManager().disablePlugin(this);
            return;
        }

        GuildProvider.init();
        if (GuildProvider.isAvailable())      getLogger().info("Guilds found – guild info enabled.");
        GroupStatsProvider.init();
        if (GroupStatsProvider.isAvailable()) getLogger().info("GroupStats found – group stats enabled.");
        RankProvider.init();
        if (RankProvider.isAvailable())       getLogger().info("LuckPerms found – rank info enabled.");

        httpServer = new StatsHttpServer(this);
        httpServer.start();

        GuiListener guiListener = new GuiListener();
        getServer().getPluginManager().registerEvents(guiListener, this);

        ApiKeyCommand cmd = new ApiKeyCommand(this, guiListener);
        getCommand("apikey").setExecutor(cmd);
        getCommand("apikey").setTabCompleter(cmd);

        getLogger().info("BWStatsAPI v" + getDescription().getVersion() + " enabled.");
        getLogger().info("HTTP server listening on port " + getConfig().getInt("http-port", 7070));
    }

    @Override
    public void onDisable() {
        if (httpServer    != null) httpServer.stop();
        if (apiKeyManager != null) apiKeyManager.close();
        getLogger().info("BWStatsAPI disabled.");
    }

    public static BWStatsAPI getInstance()  { return instance; }
    public ApiKeyManager getApiKeyManager() { return apiKeyManager; }
}
