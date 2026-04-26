package fun.crushmc.bwmystery.commands;

import fun.crushmc.bwmystery.BWMystery;
import fun.crushmc.bwmystery.data.MysteryBox;
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
 * /gmysteryboxes give <player> <amount> [quality] [ex=7h/7d/7m/false]
 *
 * Quality is free-form, defaulting to whatever is set in config (COMMON).
 * The ex= argument supports:
 *   ex=7h    -> expires 7 hours from now
 *   ex=7d    -> expires 7 days from now
 *   ex=7m    -> expires 7 minutes from now
 *   ex=false -> no expiry (default if omitted)
 */
public final class MysteryBoxesCommand implements CommandExecutor, TabCompleter {

    private static final List<String> SUB = Collections.singletonList("give");
    private static final List<String> QUALITIES =
            Arrays.asList("COMMON", "RARE", "EPIC", "LEGENDARY");
    private static final List<String> EX_HINTS =
            Arrays.asList("ex=7h", "ex=7d", "ex=7m", "ex=false");

    private final BWMystery plugin;

    public MysteryBoxesCommand(BWMystery plugin) {
        this.plugin = plugin;
    }

    @Override
    public boolean onCommand(CommandSender sender, Command cmd, String label, String[] args) {
        if (!sender.hasPermission("bwmystery.command.mysteryboxes")) {
            sender.sendMessage(ChatColor.RED + "You don't have permission to use this command.");
            return true;
        }
        if (args.length < 3 || !args[0].equalsIgnoreCase("give")) {
            sendUsage(sender, label);
            return true;
        }

        // Resolve target player (online OR offline)
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

        // Parse amount
        int amount;
        try {
            amount = Integer.parseInt(args[2]);
        } catch (NumberFormatException ex) {
            sender.sendMessage(ChatColor.RED + "Amount must be a number.");
            return true;
        }
        if (amount <= 0) {
            sender.sendMessage(ChatColor.RED + "Amount must be greater than 0.");
            return true;
        }

        String defaultQuality = plugin.getConfig().getString("defaults.box-quality", "COMMON");
        String quality = defaultQuality;
        Long expiresAtAbs = null; // null -> 0 (no expiry)

        // Optional positional args: [quality] [ex=...]
        for (int i = 3; i < args.length; i++) {
            String token = args[i];
            if (token.toLowerCase().startsWith("ex=")) {
                Long parsed = parseExpiry(token.substring(3));
                if (parsed == null) {
                    sender.sendMessage(ChatColor.RED + "Invalid ex= value. Use 7h, 7d, 7m, or false.");
                    return true;
                }
                expiresAtAbs = parsed;
            } else {
                // Treat first non-ex= positional after amount as quality
                quality = token.toUpperCase();
            }
        }

        long expiresAt = expiresAtAbs == null ? 0L : expiresAtAbs;

        PlayerProfile profile = plugin.getDataStore().get(targetUuid);
        for (int i = 0; i < amount; i++) {
            profile.addBox(new MysteryBox(UUID.randomUUID(), quality, expiresAt));
        }
        plugin.getDataStore().markDirty();

        String expDesc = expiresAt == 0L
                ? "no expiry"
                : "expires in " + describeRemaining(expiresAt - System.currentTimeMillis());
        sender.sendMessage(ChatColor.GREEN + "Gave "
                + ChatColor.YELLOW + amount + ChatColor.GREEN + " "
                + ChatColor.AQUA + quality + ChatColor.GREEN + " mystery box(es) to "
                + ChatColor.YELLOW + targetName + ChatColor.GREEN + " (" + expDesc + ").");

        if (online != null) {
            online.sendMessage(ChatColor.GOLD + "You received " + ChatColor.YELLOW + amount
                    + ChatColor.GOLD + " " + ChatColor.AQUA + quality
                    + ChatColor.GOLD + " mystery box(es).");
        }
        return true;
    }

    /** Returns absolute epoch ms, or 0L for "no expiry", or null if invalid. */
    private Long parseExpiry(String value) {
        if (value == null || value.isEmpty()) return null;
        if (value.equalsIgnoreCase("false") || value.equalsIgnoreCase("none")
                || value.equalsIgnoreCase("never")) {
            return 0L;
        }
        if (value.length() < 2) return null;
        char unit = Character.toLowerCase(value.charAt(value.length() - 1));
        String num = value.substring(0, value.length() - 1);
        long n;
        try {
            n = Long.parseLong(num);
        } catch (NumberFormatException ex) {
            return null;
        }
        if (n <= 0) return null;
        long ms;
        switch (unit) {
            case 'm': ms = n * 60_000L;             break; // minutes
            case 'h': ms = n * 3_600_000L;          break; // hours
            case 'd': ms = n * 86_400_000L;         break; // days
            default:  return null;
        }
        return System.currentTimeMillis() + ms;
    }

    private String describeRemaining(long ms) {
        if (ms <= 0) return "expired";
        long days = ms / 86_400_000L;
        long hours = (ms / 3_600_000L) % 24;
        long mins = (ms / 60_000L) % 60;
        StringBuilder sb = new StringBuilder();
        if (days > 0) sb.append(days).append("d ");
        if (hours > 0) sb.append(hours).append("h ");
        if (mins > 0 || sb.length() == 0) sb.append(mins).append("m");
        return sb.toString().trim();
    }

    private void sendUsage(CommandSender sender, String label) {
        sender.sendMessage(ChatColor.YELLOW + "Usage: /" + label
                + " give <player> <amount> [quality] [ex=7h/7d/7m/false]");
    }

    @Override
    public List<String> onTabComplete(CommandSender sender, Command cmd, String alias, String[] args) {
        if (!sender.hasPermission("bwmystery.command.mysteryboxes")) {
            return Collections.emptyList();
        }
        if (args.length == 1) return filter(SUB, args[0]);
        if (args.length == 2) {
            List<String> names = new ArrayList<>();
            for (Player p : Bukkit.getOnlinePlayers()) names.add(p.getName());
            return filter(names, args[1]);
        }
        if (args.length == 3) return filter(Arrays.asList("1", "5", "10"), args[2]);
        if (args.length == 4) return filter(QUALITIES, args[3]);
        if (args.length == 5) return filter(EX_HINTS, args[4]);
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
