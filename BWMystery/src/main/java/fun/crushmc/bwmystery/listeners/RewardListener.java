package fun.crushmc.bwmystery.listeners;

import com.andrei1058.bedwars.api.events.player.PlayerXpGainEvent;
import fun.crushmc.bwmystery.BWMystery;
import fun.crushmc.bwmystery.data.PlayerProfile;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;

/**
 * Hooks BedWars1058's XP-gain event so that whenever a player receives XP
 * from a built-in reward (playtime tick, kill, final kill, bed, win),
 * we mirror that as a coin grant — without requiring a /coins command.
 *
 * Coin amounts are read from config.yml and can be tuned per source or set
 * to 0 to disable.
 */
public final class RewardListener implements Listener {

    private final BWMystery plugin;

    public RewardListener(BWMystery plugin) {
        this.plugin = plugin;
    }

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onXpGain(PlayerXpGainEvent e) {
        Player player = e.getPlayer();
        if (player == null) return;

        long coins = coinsFor(e.getXpSource());
        if (coins <= 0) return;

        PlayerProfile profile = plugin.getDataStore().get(player.getUniqueId());
        profile.addCoins(coins);
        plugin.getDataStore().markDirty();
    }

    private long coinsFor(PlayerXpGainEvent.XpSource src) {
        if (src == null) return 0L;
        String key;
        switch (src) {
            case PER_MINUTE:    key = "per-minute";    break;
            case PER_TEAMMATE:  key = "per-teammate";  break;
            case REGULAR_KILL:  key = "regular-kill";  break;
            case FINAL_KILL:    key = "final-kill";    break;
            case BED_DESTROYED: key = "bed-destroyed"; break;
            case GAME_WIN:      key = "game-win";      break;
            default:            return 0L;
        }
        return plugin.getConfig().getLong("coins." + key, 0L);
    }
}
