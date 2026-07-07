# Solanascape Deck theme reference

The unified settings window uses authentic OSRS interface sprites from the BSD-licensed RuneLite [Resource Packs](https://github.com/melkypie/resource-packs/tree/sample-vanilla) sample pack:

- `dialog/background.png` tiles the modal body.
- `dialog/tan_border_*.png` forms the composed nine-slice frame.
- `button/regular_small.png` backs category and action buttons.
- `button/wrench*.png` provides the minimap settings control.
- `other/window_close_button_brown_x*.png` provides the close control.
- `options/square_bordered_checkbox*.png` provides toggle states.

Existing overlays continue to follow RuneLite source conventions:

- [`ComponentConstants`](https://github.com/runelite/runelite/blob/master/runelite-client/src/main/java/net/runelite/client/ui/overlay/components/ComponentConstants.java) defines the compact overlay width and translucent brown background.
- [`AttackStylesOverlay`](https://github.com/runelite/runelite/blob/master/runelite-client/src/main/java/net/runelite/client/plugins/attackstyles/AttackStylesOverlay.java) informs the title-only attack-style panel.
- [`OpponentInfoOverlay`](https://github.com/runelite/runelite/blob/master/runelite-client/src/main/java/net/runelite/client/plugins/opponentinfo/OpponentInfoOverlay.java) informs the health-ratio panel.
- [`TileIndicatorsOverlay`](https://github.com/runelite/runelite/blob/master/runelite-client/src/main/java/net/runelite/client/plugins/tileindicators/TileIndicatorsOverlay.java) informs four-corner tile polygons.

The modal renders at the canonical 765x503 client coordinate system and scales with the game canvas, keeping its authentic pixel proportions beside the minimap and over the game scene.
