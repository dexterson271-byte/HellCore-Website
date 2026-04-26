package fun.crushmc.bwmystery.data;

import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.UUID;

/**
 * In-memory record of a single player's currencies + boxes.
 * All mutations go through DataStore so writes can be marked dirty.
 */
public final class PlayerProfile {

    private final UUID uuid;
    private long coins;
    private long dust;
    private final List<MysteryBox> boxes = new ArrayList<>();

    public PlayerProfile(UUID uuid) {
        this.uuid = uuid;
    }

    public UUID getUuid() {
        return uuid;
    }

    // ------- coins -------

    public long getCoins() {
        return coins;
    }

    public void addCoins(long amount) {
        if (amount == 0) return;
        coins = Math.max(0L, coins + amount);
    }

    public void setCoins(long amount) {
        coins = Math.max(0L, amount);
    }

    // ------- dust -------

    public long getDust() {
        return dust;
    }

    public void addDust(long amount) {
        if (amount == 0) return;
        dust = Math.max(0L, dust + amount);
    }

    public void setDust(long amount) {
        dust = Math.max(0L, amount);
    }

    // ------- boxes -------

    public List<MysteryBox> getBoxes() {
        return boxes;
    }

    public void addBox(MysteryBox box) {
        boxes.add(box);
    }

    /** Remove every box whose expiry has passed. Returns how many were purged. */
    public int purgeExpired(long now) {
        int removed = 0;
        Iterator<MysteryBox> it = boxes.iterator();
        while (it.hasNext()) {
            if (it.next().isExpired(now)) {
                it.remove();
                removed++;
            }
        }
        return removed;
    }

    public int boxCount(long now) {
        int n = 0;
        for (MysteryBox b : boxes) {
            if (!b.isExpired(now)) n++;
        }
        return n;
    }
}
