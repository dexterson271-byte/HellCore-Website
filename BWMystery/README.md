# BWMystery

Open-source [BedWars1058](https://www.spigotmc.org/resources/bedwars1058.69969/) addon
that adds **mystery boxes**, **mystery dust**, and **automatic coin rewards**.

Coins are granted automatically the same way BedWars1058 grants XP — every time
the base plugin fires its built-in playtime tick, kill, final kill, bed-broken,
or game-win XP reward, BWMystery mirrors that as a coin grant. There is no
`/coins` command on purpose.

## Commands

| Command | Permission | Description |
| ------- | ---------- | ----------- |
| `/gmysteryboxes give <player> <amount> [quality] [ex=7h\|7d\|7m\|false]` | `bwmystery.command.mysteryboxes` | Give mystery box(es) to a player. `quality` is free-form and defaults to the value in `config.yml` (`COMMON`). `ex=` controls expiry (`7h` hours, `7d` days, `7m` minutes, `false` for no expiry). |
| `/mysterydust add <player> <amount>` | `bwmystery.command.mysterydust` | Add mystery dust to a player. |

Both commands work for offline players too.

## PlaceholderAPI

If PlaceholderAPI is installed, the following placeholders register under the
**`bwmystery`** identifier (deliberately not `bw1058`, so BedWars1058's own
placeholders keep working in TAB / scoreboards):

- `%bwmystery_coins%`
- `%bwmystery_dust%`
- `%bwmystery_boxes%` — count of non-expired boxes

## Configuration (`config.yml`)

```yaml
coins:
  per-minute: 5
  per-teammate: 5
  regular-kill: 10
  final-kill: 25
  bed-destroyed: 30
  game-win: 100

defaults:
  box-quality: COMMON

storage:
  autosave-seconds: 300
```

Set any coin source to `0` to disable it.

## Persistence

Player profiles (coins / dust / boxes) live in
`plugins/BWMystery/data.yml`. The file is written every
`storage.autosave-seconds` and again on plugin disable. Expired boxes are
pruned during saves and when counted.

## Building

```bash
cd BWMystery
mvn clean package
```

The `pom.xml` references `libs/bedwars-plugin-25.2.jar` as a system-scoped
dependency. Drop the BedWars1058 jar at that path before building.

The shaded plugin jar lands at `target/BWMystery-1.0.0.jar`.

## Install

1. Build (above) or drop the prebuilt jar into your server's `plugins/` folder.
2. Restart the server (BedWars1058 must be present and loaded first — it's a
   hard `depend` in `plugin.yml`).
3. Optional: install PlaceholderAPI for the `%bwmystery_*%` placeholders.

## License

MIT — see [LICENSE](LICENSE).
