package fun.crushmc.bwmystery;

import fun.crushmc.bwmystery.commands.MysteryBoxesCommand;
import fun.crushmc.bwmystery.commands.MysteryCoinsCommand;
import fun.crushmc.bwmystery.commands.MysteryDustCommand;
import fun.crushmc.bwmystery.data.DataStore;
import fun.crushmc.bwmystery.listeners.RewardListener;
import fun.crushmc.bwmystery.papi.MysteryExpansion;
import fun.crushmc.bwmystery.sync.StoreQueueBridge;
import org.bukkit.Bukkit;
import org.bukkit.command.PluginCommand;
import org.bukkit.plugin.java.JavaPlugin;

/**
 * BWMystery — open-source BedWars1058 addon.
 *
 * Features:
 *   - /gmysteryboxes give <player> <amount> [quality] [ex=7h/7d/7m/false]
 *   - /mysterydust  add <player> <amount>
 *   - /mysterycoins add <player> <amount>
 *   - Auto coin rewards: when BedWars1058 grants XP via its built-in sources
 *     (playtime tick, kill, final kill, bed broken, win), this addon mirrors
 *     that as a coin grant. Amounts are configured in config.yml.
 *
 * Persistence: plugins/BWMystery/data.yml — single YAML file per server.
 * PAPI placeholders (optional): %bwmystery_coins%, %bwmystery_dust%, %bwmystery_boxes%
 */
public final class BWMystery extends JavaPlugin {

    private static BWMystery instance;
    private DataStore dataStore;
    private int autosaveTaskId = -1;
    private StoreQueueBridge storeQueueBridge;

    @Override
    public void onEnable() {
        instance = this;
        saveDefaultConfig();

        dataStore = new DataStore(this);
        dataStore.load();

        // Listeners
        Bukkit.getPluginManager().registerEvents(new RewardListener(this), this);

        // Commands
        register("gmysteryboxes", new MysteryBoxesCommand(this));
        register("mysterydust",   new MysteryDustCommand(this));
        register("mysterycoins",  new MysteryCoinsCommand(this));

        // PAPI hook (optional)
        if (Bukkit.getPluginManager().getPlugin("PlaceholderAPI") != null) {
            new MysteryExpansion(this).register();
            getLogger().info("PlaceholderAPI hook active (%bwmystery_*%).");
        }

        storeQueueBridge = new StoreQueueBridge(this);
        storeQueueBridge.start();

        // Periodic save
        long ticks = Math.max(60L, getConfig().getLong("storage.autosave-seconds", 300L)) * 20L;
        autosaveTaskId = Bukkit.getScheduler().runTaskTimerAsynchronously(this,
                () -> dataStore.save(), ticks, ticks).getTaskId();

        getLogger().info("BWMystery v" + getDescription().getVersion() + " enabled.");
    }

    @Override
    public void onDisable() {
        if (autosaveTaskId != -1) {
            Bukkit.getScheduler().cancelTask(autosaveTaskId);
            autosaveTaskId = -1;
        }
        if (dataStore != null) {
            dataStore.markDirty();
            dataStore.save();
        }
        getLogger().info("BWMystery disabled.");
    }

    private void register(String name, Object handler) {
        PluginCommand cmd = getCommand(name);
        if (cmd == null) {
            getLogger().warning("Command '" + name + "' is not declared in plugin.yml — skipped.");
            return;
        }
        if (handler instanceof org.bukkit.command.CommandExecutor) {
            cmd.setExecutor((org.bukkit.command.CommandExecutor) handler);
        }
        if (handler instanceof org.bukkit.command.TabCompleter) {
            cmd.setTabCompleter((org.bukkit.command.TabCompleter) handler);
        }
    }

    public DataStore getDataStore() {
        return dataStore;
    }

    public static BWMystery getInstance() {
        return instance;
    }
}
