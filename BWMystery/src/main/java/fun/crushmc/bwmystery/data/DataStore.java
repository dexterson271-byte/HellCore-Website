package fun.crushmc.bwmystery.data;

import org.bukkit.configuration.ConfigurationSection;
import org.bukkit.configuration.file.YamlConfiguration;
import org.bukkit.plugin.java.JavaPlugin;

import java.io.File;
import java.io.IOException;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.logging.Level;

/**
 * Persists every player's coins / dust / boxes to a single YAML file
 * (plugins/BWMystery/data.yml).
 *
 * Design notes:
 * - Profiles are loaded lazily on first access, cached in memory.
 * - All mutations mark the store dirty; saves are batched on autosave + disable.
 * - Box list is serialized as a list of small maps (id, quality, expiresAt).
 */
public final class DataStore {

    private final JavaPlugin plugin;
    private final File file;
    private final Map<UUID, PlayerProfile> profiles = new ConcurrentHashMap<>();
    private volatile boolean dirty = false;

    private YamlConfiguration yaml;

    public DataStore(JavaPlugin plugin) {
        this.plugin = plugin;
        this.file = new File(plugin.getDataFolder(), "data.yml");
    }

    public void load() {
        if (!plugin.getDataFolder().exists() && !plugin.getDataFolder().mkdirs()) {
            plugin.getLogger().warning("Could not create data folder.");
        }
        if (!file.exists()) {
            try {
                if (!file.createNewFile()) {
                    plugin.getLogger().warning("Could not create data.yml");
                }
            } catch (IOException e) {
                plugin.getLogger().log(Level.SEVERE, "Failed to create data.yml", e);
            }
        }
        yaml = YamlConfiguration.loadConfiguration(file);
    }

    public PlayerProfile get(UUID uuid) {
        PlayerProfile cached = profiles.get(uuid);
        if (cached != null) return cached;

        PlayerProfile profile = new PlayerProfile(uuid);
        ConfigurationSection sec = yaml.getConfigurationSection(uuid.toString());
        if (sec != null) {
            profile.setCoins(sec.getLong("coins", 0L));
            profile.setDust(sec.getLong("dust", 0L));
            List<Map<?, ?>> rawBoxes = sec.getMapList("boxes");
            for (Map<?, ?> raw : rawBoxes) {
                try {
                    Object idObj = raw.get("id");
                    Object qualityObj = raw.get("quality");
                    Object expObj = raw.get("expiresAt");
                    if (idObj == null) continue;
                    UUID id = UUID.fromString(String.valueOf(idObj));
                    String quality = qualityObj == null ? "COMMON" : String.valueOf(qualityObj);
                    long exp = expObj instanceof Number ? ((Number) expObj).longValue() : 0L;
                    profile.addBox(new MysteryBox(id, quality, exp));
                } catch (Exception ignored) { /* skip malformed entry */ }
            }
        }
        profiles.put(uuid, profile);
        return profile;
    }

    public void markDirty() {
        dirty = true;
    }

    public synchronized void save() {
        if (!dirty || yaml == null) return;
        long now = System.currentTimeMillis();
        for (Map.Entry<UUID, PlayerProfile> entry : profiles.entrySet()) {
            PlayerProfile p = entry.getValue();
            p.purgeExpired(now);

            String key = entry.getKey().toString();
            yaml.set(key + ".coins", p.getCoins());
            yaml.set(key + ".dust", p.getDust());

            List<Map<String, Object>> serialized = new java.util.ArrayList<>();
            for (MysteryBox box : p.getBoxes()) {
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("id", box.getId().toString());
                m.put("quality", box.getQuality());
                m.put("expiresAt", box.getExpiresAt());
                serialized.add(m);
            }
            yaml.set(key + ".boxes", serialized);
        }
        try {
            yaml.save(file);
            dirty = false;
        } catch (IOException e) {
            plugin.getLogger().log(Level.SEVERE, "Failed to save data.yml", e);
        }
    }

    /** Drop in-memory cache and reload from disk (admin tooling helper). */
    public synchronized void reload() {
        profiles.clear();
        load();
    }

    public Map<UUID, PlayerProfile> snapshot() {
        return new HashMap<>(profiles);
    }
}
