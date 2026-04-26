package fun.crushmc.bwmystery.papi;

import fun.crushmc.bwmystery.BWMystery;
import fun.crushmc.bwmystery.data.PlayerProfile;
import me.clip.placeholderapi.expansion.PlaceholderExpansion;
import org.bukkit.entity.Player;

/**
 * PlaceholderAPI expansion under its own identifier ("bwmystery") so it never
 * collides with BedWars1058's "bw1058" namespace.
 *
 *   %bwmystery_coins%
 *   %bwmystery_dust%
 *   %bwmystery_boxes%
 */
public final class MysteryExpansion extends PlaceholderExpansion {

    private final BWMystery plugin;

    public MysteryExpansion(BWMystery plugin) {
        this.plugin = plugin;
    }

    @Override
    public String getIdentifier() {
        return "bwmystery";
    }

    @Override
    public String getAuthor() {
        return "CrushMC";
    }

    @Override
    public String getVersion() {
        return plugin.getDescription().getVersion();
    }

    @Override
    public boolean persist() {
        return true;
    }

    @Override
    public String onPlaceholderRequest(Player player, String params) {
        if (player == null || params == null) return "";
        PlayerProfile p = plugin.getDataStore().get(player.getUniqueId());
        switch (params.toLowerCase()) {
            case "coins": return Long.toString(p.getCoins());
            case "dust":  return Long.toString(p.getDust());
            case "boxes": return Integer.toString(p.boxCount(System.currentTimeMillis()));
            default:      return null;
        }
    }
}
