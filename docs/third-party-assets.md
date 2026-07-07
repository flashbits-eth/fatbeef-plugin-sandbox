# Third-party presentation assets

Fatbeef Plugin Sandbox bundles RuneLite's `runescape.ttf`, `runescape_small.ttf`, and 21 skill-icon PNGs from the
official `runelite/runelite` repository. RuneLite is licensed under the BSD
2-Clause License. The assets are embedded into the generated userscript as data
URLs, so Fatbeef Plugin Sandbox performs no runtime asset or network requests.

Source paths:

- `runelite-client/src/main/resources/net/runelite/client/ui/runescape.ttf`
- `runelite-client/src/main/resources/net/runelite/client/ui/runescape_small.ttf`
- `runelite-client/src/main/resources/skill_icons/*.png`

Repository and license: <https://github.com/runelite/runelite>

## Standard item-name data

The standard item-name fallback was generated from the [OSRS Wiki real-time item mapping](https://prices.runescape.wiki/api/v1/osrs/mapping). Only item IDs and display names are embedded. Exact names learned from Solanascape's native ground-item menu or returned by `pluginGetItemName(id)` take precedence, preserving custom server definitions.

Ground-label presentation follows RuneLite's BSD-licensed `GroundItemsOverlay`, `FontManager`, and `QuantityFormatter`: RuneScape Small, a 20-unit world-height offset, 15 px stacked-label spacing, white default text with a one-pixel shadow, and compact stack quantities. RuneLite's Java2D font size 16 is rendered at 8 CSS px because this TTF's browser glyph metrics are approximately twice its Java2D visual height.

## RuneLite Resource Packs OSRS interface sprites

The Deck settings interface embeds the following sprites from the BSD-2-Clause
[`melkypie/resource-packs`](https://github.com/melkypie/resource-packs/tree/sample-vanilla)
`sample-vanilla` branch:

- `dialog/background.png`
- `dialog/tan_border_*.png`
- `button/regular_small.png`
- `button/wrench.png` and `button/wrench_hovered.png`
- `other/window_close_button_brown_x.png` and its hovered variant
- `options/square_bordered_checkbox.png` and its checked variant

The eight tan border tiles are composed into one nine-slice image without
redrawing their pixels. All assets remain embedded locally in the bundle.

## RuneLite BSD 2-Clause License

Copyright (c) 2016-2017, Adam <Adam@sigterm.info>
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

* Redistributions of source code must retain the above copyright notice, this
  list of conditions and the following disclaimer.

* Redistributions in binary form must reproduce the above copyright notice,
  this list of conditions and the following disclaimer in the documentation
  and/or other materials provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
