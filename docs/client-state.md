# Solanascape client-state baseline

The state-mapping baseline was inspected on 2026-07-01 from `client.js?v=20260702c`; the native menu hook was revalidated on 2026-07-02 against `client.js?v=20260702r`. Solanascape replaces and re-obfuscates the client frequently, so Diagnostics reads the actual loaded script URL instead of reporting only the compiled baseline.

Raw names are confined to `src/mapping.ts`. Every feature is structurally validated and independently capability-gated. Diagnostics reports only property names, types, lengths, methods, resolved mappings, and failures; it does not include string values or invoke accessors.

## Current validated state

| Capability | Preferred source | Current raw mapping | Validation | Confidence |
| --- | --- | --- | --- | --- |
| Login | `pluginIsIngame()` | `Xr` fallback | Boolean | High |
| Skills | `pluginGetStatXp()`, `pluginGetStatLevel()`, `pluginGetStatBase()` | `Fz` XP, `Dz` current, `Ez` base | Public finite values; raw fallback validates against the XP curve | High |
| Player tile | `pluginGetPlayerTile()` | `tz.x`, `tz.z`, `tz.level`, `ev`, `fv` | Finite coordinates/plane | High |
| Movement destination | - | `tz.Mo[0]`, `tz.No[0]` while `tz.Lo > 0` | Bounded integer route queue on local player | Source-confirmed |
| Run state | `pluginGetRunEnergy()`, `pluginIsRunning()` | - | Finite number/boolean | High |
| Animation | - | `tz.so` | Integer; `-1` idle and positive active animations | Source-confirmed |
| NPCs | `pluginFindNpc(name)` | `Nu` table, `Pu` indexes, `Ou` count | Bounded table/index/count and entity shape | High |
| Current opponent | - | `tz.mo` indexes `Nu` | Integer NPC slot below 32768 | Source-confirmed |
| Opponent health | - | NPC `eo` ratio and `fo` scale | `0 <= ratio <= scale`; used directly by the client health-bar renderer | Source-confirmed |
| Scene projection | - | `jm`, `yn`, `xy`, `yy`, `zy`, `By`, `Ay`, `Lc`, `Mc` | Terrain grid, camera/mouse coordinates, and 0-2047 angles | Source-confirmed |
| Inventory count | `pluginGetInvItemCount(id)` | component count fallback | Non-negative finite result | High |
| Varps | `pluginGetVarp(id)` | - | Finite result | High |
| Attack style | - | `lA[43]` | Integer 0-3 | Provisional |
| Ground items | `pluginGetNearbyGroundItems(radius)`, `pluginGetItemName(id)` | `zz[plane][localX][localZ]` linked item nodes | Bounded nearby scan; integer ID/count; projected validated tile | Source-confirmed |

The skills retain the standard 21-skill ordering. If their names change, adaptive discovery examines only own data properties containing exactly 21 numeric values and accepts only one uniquely valid XP/current/base triplet. It never invokes unrelated property accessors.

## Projection and tile polygons

`jm[plane][x][z]` contains terrain heights and `yn` contains bridge/render flags. Camera coordinates are `xy`, `yy`, and `zy`; `By` is yaw and `Ay` is pitch in 2048-unit angles. The deployed scene raster is 512x334 at canvas offset (4,4), with center 256x167 and projection scale 512.

While enabled, Solanascape Deck casts one display-synchronized inverse camera ray from the client-maintained mouse coordinates `Lc`/`Mc` into the terrain height map, then tests at most nine neighboring polygons around the intersection. It emits at most one hovered polygon and performs no projection work while disabled. It does not call the internal `bF()` projector because that method writes scratch coordinates `Ty` and `Uy`.

The movement indicator reads the endpoint at index zero of the local player's `Mo`/`No` route arrays while `Lo` reports a non-empty route. The client consumes `Lo` as movement completes, so the indicator disappears on arrival without observing or intercepting click events. This also follows routes initiated through the minimap or interactions.

Ground-item labels reuse the same validated projection. The 250 ms observer scans only a bounded nearby radius; display-synchronized frames reproject the resulting small item list without rescanning the grid. Names come from first-party item-name data when exposed, with `Item <id>` as the non-guessing fallback.

## Opponent health limitation

The client exposes a quantized ratio and scale, not exact NPC hitpoints. Solanascape Deck therefore displays an approximate percentage. It does not claim an exact current/max HP value or use external NPC data.

## Legacy-gated collections

Nearby-player, ground-item, chat, and scene-object mappings were established for `client.js?v=20260627u`. They remain runtime-gated after the remap and report unavailable until deliberately revalidated. Full inventory and bank enumeration are still unavailable.

First-party scripts reference `pluginProjectWorldToScreen`, `pluginGetNearbyGroundItems`, `pluginGetPlayerAnimation`, `pluginGetStatLevel`, `pluginGetStatBase`, and `pluginGetBankItems`, but those public methods remain absent from the inspected build.

## Client-side boundary

Solanascape Deck calls validated read-only getters. Menu Swapper changes only native menu priority/order and never invokes a selected action. Deck does not create network connections, synthesize input, attach listeners to the game canvas, inspect packets, or read canvas pixels.
