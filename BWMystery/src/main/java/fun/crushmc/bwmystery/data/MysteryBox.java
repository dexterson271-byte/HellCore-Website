package fun.crushmc.bwmystery.data;

import java.util.UUID;

/**
 * Single mystery box owned by a player.
 *
 * - quality:   free-form string (COMMON / RARE / EPIC / LEGENDARY by convention)
 * - expiresAt: epoch millis at which this box expires (0 = never expires)
 * - id:        stable per-box id so tools/UI can address an individual box
 */
public final class MysteryBox {

    private final UUID id;
    private final String quality;
    private final long expiresAt;

    public MysteryBox(UUID id, String quality, long expiresAt) {
        this.id = id;
        this.quality = quality == null ? "COMMON" : quality.toUpperCase();
        this.expiresAt = expiresAt;
    }

    public UUID getId() {
        return id;
    }

    public String getQuality() {
        return quality;
    }

    /** 0 means never expires. */
    public long getExpiresAt() {
        return expiresAt;
    }

    public boolean isExpired(long now) {
        return expiresAt > 0 && now >= expiresAt;
    }
}
