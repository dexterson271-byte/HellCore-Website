package fun.crushmc.bwmystery.commands;

import fun.crushmc.bwmystery.BWMystery;
import fun.crushmc.bwmystery.data.PlayerProfile;
import org.bukkit.Bukkit;
import org.bukkit.ChatColor;
import org.bukkit.OfflinePlayer;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.command.TabCompleter;
import org.bukkit.entity.Player;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.UUID;

/**
 * /mysterycoins add <player> <amount>
 */
public final class MysteryCoinsCommand implements CommandExecutor, TabCompleter {

    private static final List<String> SUB = Collections.singletonList("add");

    private final BWMystery plugin;

    public MysteryCoinsCommand(BWMystery plugin) {
        this.plugin = plugin;
    }

    @Override
    public boolean onCommand(CommandSender sender, Command cmd, String label, String[] args) {
        if (!sender.hasPermission("bwmystery.command.mysterycoins")) {
            sender.sendMessage(ChatColor.RED + "You don't have permission to use this command.");
            return true;
        }
        if (args.length < 3 || !args[0].equalsIgnoreCase("add")) {
            sender.sendMessage(ChatColor.YELLOW + "Usage: /" + label + " add <player> <amount>");
            return true;
        }

        String targetName = args[1];
        Player online = Bukkit.getPlayerExact(targetName);
        UUID targetUuid;
        if (online != null) {
            targetUuid = online.getUniqueId();
        } else {
            @SuppressWarnings("deprecation")
            OfflinePlayer off = Bukkit.getOfflinePlayer(targetName);
            if (off == null || off.getUniqueId() == null) {
                sender.sendMessage(ChatColor.RED + "Unknown player: " + targetName);
                return true;
            }
            targetUuid = off.getUniqueId();
        }

        long amount;
        try {
            amount = Long.parseLong(args[2]);
        } catch (NumberFormatException ex) {
            sender.sendMessage(ChatColor.RED + "Amount must be a number.");
            return true;
        }
        if (amount == 0) {
            sender.sendMessage(ChatColor.RED + "Amount must be non-zero.");
            return true;
        }

        PlayerProfile profile = plugin.getDataStore().get(targetUuid);
        profile.addCoins(amount);
        plugin.getDataStore().markDirty();

        sender.sendMessage(ChatColor.GREEN + "Added "
                + ChatColor.YELLOW + amount + ChatColor.GREEN + " coins to "
                + ChatColor.YELLOW + targetName + ChatColor.GREEN
                + " (new total: " + profile.getCoins() + ").");

        if (online != null) {
            online.sendMessage(ChatColor.GOLD + "You received "
                    + ChatColor.YELLOW + amount
                    + ChatColor.GOLD + " BedWars coins.");
        }
        return true;
    }

    @Override
    public List<String> onTabComplete(CommandSender sender, Command cmd, String alias, String[] args) {
        if (!sender.hasPermission("bwmystery.command.mysterycoins")) {
            return Collections.emptyList();
        }
        if (args.length == 1) return filter(SUB, args[0]);
        if (args.length == 2) {
            List<String> names = new ArrayList<>();
            for (Player p : Bukkit.getOnlinePlayers()) names.add(p.getName());
            return filter(names, args[1]);
        }
        if (args.length == 3) return filter(Arrays.asList("1000", "10000", "50000"), args[2]);
        return Collections.emptyList();
    }

    private static List<String> filter(List<String> options, String prefix) {
        String p = prefix.toLowerCase();
        List<String> out = new ArrayList<>();
        for (String s : options) {
            if (s.toLowerCase().startsWith(p)) out.add(s);
        }
        return out;
    }
}
