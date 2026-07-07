# First-party integration guide

This package is structured so Solanascape Deck can move from a userscript into the browser client without carrying Tampermonkey-specific assumptions through the feature code.

## Recommended integration order

1. Keep `ClientAdapter` as the boundary between the game client and plugins.
2. Replace raw mappings with stable first-party getters wherever possible.
3. Mount the plugin manager after the game canvas and `gameClient` are initialized.
4. Keep the single 250 ms observer for state changes; tile rendering uses a display-synchronized loop only while enabled.
5. Mount the existing Shadow DOM UI or port its components into the client's interface layer.
6. Retain capability validation so one unavailable subsystem cannot disable unrelated features.

## Stable getter surface

The adapter already prefers these public methods when available:

- `pluginIsIngame()`
- `pluginGetUsername()`
- `pluginGetStatXp(id)`
- `pluginGetStatLevel(id)`
- `pluginGetStatBase(id)`
- `pluginGetPlayerTile()`
- `pluginGetRunEnergy()`
- `pluginIsRunning()`
- `pluginGetVarp(id)`
- `pluginGetInvItemCount(id)`
- `pluginGetComponentItemCount(component, id)`

Adding stable first-party methods for projection, destination tile, current opponent, health ratio, current animation, and attack style would allow the remaining raw mappings to be retired.

## Feature boundaries

- XP presentation: `src/plugins/xp-tracker.ts`, `src/xp-session.ts`, `src/experience.ts`
- Tile presentation: `src/plugins/tile-overlay.ts` and projection normalization in `src/adapter.ts`
- Ground-item labels: `src/plugins/ground-item-labels.ts` and normalized item data in `src/adapter.ts`
- Combat presentation: `src/plugins/combat-hud.ts` and `src/plugins/attack-style-hud.ts`
- Threshold notifications: `src/plugins/hitpoints-notifier.ts`, `src/plugins/prayer-notifier.ts`, `src/audio-alert.ts`
- Defensive-style protection: `src/plugins/defensive-style-guard.ts`
- Native menu priorities: `src/menu-swapper-core.ts`
- Settings and interface: `src/storage.ts`, `src/ui/deck-settings.ts`, `src/ui/styles.ts`

## Validation

Run `npm run verify` before integrating or releasing. It performs strict type checking, behavioral tests, a deterministic build, and a bundle audit for prohibited runtime pathways.
