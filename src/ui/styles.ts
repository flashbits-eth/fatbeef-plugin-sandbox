import runescapeFont from "../assets/runescape.ttf";
import runescapeSmallFont from "../assets/runescape_small.ttf";
import { OSRS_UI_ASSETS } from "./osrs-assets";

export const SOLANASCAPE_DECK_STYLES = `
@font-face {
  font-family: "Solanascape Deck RuneScape";
  src: url("${runescapeFont}") format("truetype");
  font-display: block;
}

@font-face {
  font-family: "Solanascape Deck RuneScape Small";
  src: url("${runescapeSmallFont}") format("truetype");
  font-display: block;
}

:host {
  all: initial;
  --rl-brand: rgb(220, 138, 0);
  --rl-panel: rgba(70, 61, 50, .88);
  --rl-overlay: rgba(70, 61, 50, .612);
  --rl-dark: rgb(30, 30, 30);
  --rl-darker: rgb(23, 23, 23);
  --rl-medium: rgb(77, 77, 77);
  --rl-text: rgb(198, 198, 198);
  --rl-progress: rgb(82, 161, 82);
  color-scheme: dark;
  font-family: 'RS Plain 12', 'RuneScape', Arial, sans-serif;
  pointer-events: none;
  position: fixed;
  inset: 0;
  z-index: 2147483000;
}

*, *::before, *::after { box-sizing: border-box; }

.sl-panel {
  background: var(--rl-panel);
  border: 1px solid rgba(56, 49, 40, .96);
  border-radius: 0;
  box-shadow: inset 0 0 0 1px rgba(84, 73, 60, .96), 0 3px 9px rgba(0, 0, 0, .65);
  color: white;
  left: auto;
  max-height: min(78vh, 720px);
  min-width: 310px;
  overflow: hidden;
  pointer-events: auto;
  position: fixed;
  right: 24px;
  top: 96px;
  width: 350px;
}
.sl-panel.sl-docked { box-shadow: inset 0 0 0 1px rgba(84, 73, 60, .96), 0 2px 5px rgba(0, 0, 0, .58); }
.sl-panel.sl-collapsed { width: 360px; min-width: 320px; }
.sl-panel.sl-collapsed .sl-body { display: none; }
.sl-panel:not(.sl-collapsed) .sl-compact-summary { display: none; }
.sl-panel.sl-lite-panel { max-height: none; min-width: 0; overflow: visible; width: 220px; }
.sl-lite-panel .sl-titlebar { cursor: default; min-height: 32px; padding-block: 3px; }
.sl-lite-panel .sl-icon-button { font-size: 11px; width: 42px; }
.sl-lite-menu { background: rgba(23, 23, 23, .98); border: 1px solid rgba(56, 49, 40, .96); box-shadow: 0 3px 8px rgba(0,0,0,.7); }
.sl-lite-menu[hidden] { display: none; }
.sl-diagnostics-button { margin: 0 5px 5px; width: calc(100% - 10px); }

.sl-titlebar {
  align-items: center;
  background: rgba(0, 0, 0, .16);
  border-bottom: 1px solid rgba(35, 30, 25, .9);
  cursor: grab;
  display: flex;
  gap: 7px;
  min-height: 36px;
  padding: 5px 6px 5px 8px;
  touch-action: none;
  user-select: none;
}
.sl-titlebar:active { cursor: grabbing; }
.sl-panel.sl-docked .sl-titlebar, .sl-panel.sl-docked .sl-titlebar:active { cursor: default; }
.sl-brand { color: white; font-size: 16px; font-weight: 700; text-shadow: 1px 1px #000; }
.sl-status-dot { background: var(--rl-brand); box-shadow: 1px 1px #000; height: 6px; transform: rotate(45deg); width: 6px; }
.sl-status-dot.sl-ready { background: rgb(55, 240, 70); }
.sl-compact-summary { color: var(--rl-text); display: flex; font-size: 13px; gap: 7px; margin-left: 4px; text-shadow: 1px 1px #000; }
.sl-compact-xp { color: var(--rl-brand); }
.sl-compact-time::before { color: #8f867b; content: "·"; margin-right: 7px; }
.sl-title-spacer { flex: 1; }

.sl-icon-button, .sl-button {
  appearance: none;
  background: var(--rl-dark);
  border: 1px solid var(--rl-darker);
  border-radius: 0;
  box-shadow: inset 0 0 0 1px var(--rl-medium);
  color: var(--rl-text);
  cursor: pointer;
  font: inherit;
  text-shadow: 1px 1px #000;
}
.sl-icon-button { height: 25px; line-height: 20px; padding: 0; width: 27px; }
.sl-button { font-size: 12px; padding: 4px 7px; }
.sl-icon-button:hover, .sl-button:hover { background: rgb(60, 60, 60); color: white; }
.sl-button.sl-danger { color: rgb(230, 90, 80); }
.sl-button.sl-confirm { background: rgb(100, 30, 25); color: white; }

.sl-body { max-height: calc(min(78vh, 720px) - 36px); overflow: auto; }
.sl-summary { border-bottom: 1px solid rgba(35, 30, 25, .8); display: grid; gap: 4px 12px; grid-template-columns: 1fr auto; padding: 9px 8px; }
.sl-summary-label { color: var(--rl-text); font-size: 12px; }
.sl-summary-value { color: white; font-size: 13px; text-align: right; text-shadow: 1px 1px #000; }
.sl-summary-value.sl-accent { color: var(--rl-brand); }
.sl-message { color: var(--rl-text); font-size: 13px; line-height: 1.35; padding: 14px 9px; text-align: center; text-shadow: 1px 1px #000; }

.sl-skill-list { display: flex; flex-direction: column; }
.sl-skill { border-bottom: 1px solid rgba(35, 30, 25, .72); display: grid; gap: 4px 8px; grid-template-columns: minmax(90px, 1fr) auto auto; padding: 7px 8px; }
.sl-skill:last-child { border-bottom: 0; }
.sl-skill-name { color: white; font-size: 13px; text-shadow: 1px 1px #000; }
.sl-skill-level { color: var(--rl-text); font-size: 12px; margin-left: 5px; }
.sl-skill-gained { color: var(--rl-brand); font-size: 13px; text-align: right; text-shadow: 1px 1px #000; }
.sl-skill-rate { color: white; font-size: 12px; text-align: right; text-shadow: 1px 1px #000; }
.sl-progress-track { background: rgba(255, 255, 255, .5); box-shadow: inset 0 0 0 1px rgba(0, 0, 0, .45); grid-column: 1 / 4; height: 12px; overflow: hidden; }
.sl-progress-fill { background: var(--rl-progress); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .08); height: 100%; min-width: 0; }
.sl-skill-meta { color: var(--rl-text); font-size: 11px; grid-column: 1 / 4; text-shadow: 1px 1px #000; }

.sl-toolbar { align-items: center; background: rgba(0, 0, 0, .12); border-top: 1px solid rgba(35, 30, 25, .8); display: flex; flex-wrap: wrap; gap: 5px; padding: 6px; }
.sl-toolbar-status { color: var(--rl-text); flex: 1; font-size: 11px; min-width: 82px; text-shadow: 1px 1px #000; }

.sl-overlay-menu { background: rgba(23, 23, 23, .98); border-top: 1px solid rgba(84, 73, 60, .9); display: grid; gap: 1px; grid-template-columns: 1fr 1fr; padding: 5px; }
.sl-overlay-menu[hidden] { display: none; }
.sl-overlay-toggle { align-items: center; appearance: none; background: rgb(30, 30, 30); border: 1px solid rgb(23, 23, 23); box-shadow: inset 0 0 0 1px rgb(77, 77, 77); color: var(--rl-text); cursor: pointer; display: flex; font: inherit; font-size: 12px; gap: 6px; min-height: 27px; padding: 4px 6px; text-align: left; text-shadow: 1px 1px #000; }
.sl-overlay-toggle::before { border: 1px solid #7d7469; color: #44e35e; content: ""; display: inline-grid; height: 12px; place-items: center; width: 12px; }
.sl-overlay-toggle.sl-enabled { color: white; }
.sl-overlay-toggle.sl-enabled::before { content: "✓"; font-family: Arial, sans-serif; font-size: 11px; line-height: 10px; }
.sl-overlay-toggle:hover { background: rgb(60, 60, 60); }
.sl-zoom-controls { display: grid; gap: 3px; grid-column: 1 / -1; grid-template-columns: 1fr 1fr 1fr; padding-top: 3px; }
.sl-zoom-controls .sl-button:disabled { color: #706a63; cursor: default; opacity: .72; }

.sl-xp-drop-layer, .sl-attack-style-layer, .sl-tile-layer, .sl-combat-layer, .sl-ground-item-layer, .sl-player-name-layer { contain: layout paint; overflow: hidden; pointer-events: none; position: fixed; }
.sl-xp-scene { height: 503px; position: absolute; transform: scale(var(--sl-canvas-scale-x, 1), var(--sl-canvas-scale-y, 1)); transform-origin: left top; width: 765px; }
.sl-xp-drop-lane { align-items: flex-end; display: flex; flex-direction: column; gap: 1px; position: absolute; right: 253px; top: 72px; }
.sl-xp-drop { align-items: center; animation: sl-xp-drop 1.75s cubic-bezier(.2, .72, .35, 1) forwards; color: white; display: flex; filter: drop-shadow(1px 1px #000); font-family: "Solanascape Deck RuneScape Small", sans-serif; font-kerning: none; font-size: 9px; gap: 2px; line-height: 10px; text-rendering: optimizeSpeed; white-space: nowrap; }
.sl-xp-drop-icon { height: 10px; image-rendering: pixelated; object-fit: contain; width: 10px; }
.sl-xp-drop-value { color: #ff981f; }
@keyframes sl-xp-drop {
  0% { opacity: 0; transform: translateY(4px); }
  12% { opacity: .96; transform: translateY(0); }
  72% { opacity: .9; }
  100% { opacity: 0; transform: translateY(-7px); }
}
.sl-xp-globe-lane { display: flex; gap: 4px; left: 260px; position: absolute; top: 9px; transform: translateX(-50%); }
.sl-xp-globe { background: transparent; border: 0; border-radius: 50%; box-shadow: none; box-sizing: border-box; height: 23px; opacity: 1; pointer-events: auto; position: relative; transition: opacity .75s linear; width: 23px; }
.sl-xp-globe-fading { opacity: 0; }
.sl-xp-globe-svg { height: 23px; inset: 0; overflow: visible; position: absolute; shape-rendering: geometricPrecision; width: 23px; }
.sl-xp-globe-background { fill: rgba(128,128,128,.5); transition: fill .12s linear; }
.sl-xp-globe-track { fill: none; stroke: #000; stroke-width: 5; }
.sl-xp-globe-progress { fill: none; stroke: #ffd42a; stroke-linecap: butt; stroke-width: 2; }
.sl-xp-globe-icon { height: 12px; image-rendering: pixelated; left: 5.5px; object-fit: contain; position: absolute; top: 5.5px; width: 12px; z-index: 1; }
.sl-xp-globe:hover .sl-xp-globe-background { fill: rgba(0,0,0,.706); }
.sl-xp-globe-tooltip { background: rgba(54, 48, 41, .46); border: 1px solid rgba(24,20,17,.68); box-shadow: inset 0 0 0 1px rgba(102,90,75,.28), 1px 1px 2px rgba(0,0,0,.48); color: white; display: none; font-family: "Solanascape Deck RuneScape Small", sans-serif; font-kerning: none; font-size: 8px; left: 50%; line-height: 9px; min-width: 79px; padding: 3px 4px; position: absolute; text-rendering: optimizeSpeed; text-shadow: 1px 1px #000; top: 24px; transform: translateX(-50%); white-space: nowrap; z-index: 2; }
.sl-xp-globe:hover .sl-xp-globe-tooltip { display: block; }
.sl-xp-tooltip-row { display: flex; gap: 6px; justify-content: space-between; }
.sl-xp-tooltip-label { color: #ff981f; }

.sl-attack-style-hud {
  background: var(--rl-overlay);
  border: 1px solid rgba(56, 49, 40, .86);
  box-shadow: inset 0 0 0 1px rgba(84, 73, 60, .86);
  color: white;
  min-width: 65px;
  padding: 2px 3px;
  position: absolute;
  right: 34%;
  bottom: 34%;
  text-align: center;
  text-shadow: 1px 1px #000;
}
.sl-attack-style-title { font-size: 8px; line-height: 9px; }

.sl-defensive-style-layer { contain: layout paint; overflow: hidden; pointer-events: none; position: fixed; }
.sl-defensive-style-layer[hidden] { display: none; }
.sl-defensive-style-scene { height: 503px; position: absolute; transform: scale(var(--sl-canvas-scale-x, 1), var(--sl-canvas-scale-y, 1)); transform-origin: left top; width: 765px; }
.sl-defensive-style-blocker {
  align-items: center;
  background: rgba(63, 57, 47, .97);
  border: 1px solid rgba(31, 27, 22, .95);
  box-shadow: inset 0 0 0 1px rgba(103, 91, 71, .72);
  color: #ffff00;
  cursor: not-allowed;
  display: flex;
  font-family: "Solanascape Deck RuneScape Small", sans-serif;
  font-size: 10px;
  gap: 7px;
  height: 44px;
  left: 557px;
  padding: 3px 6px;
  pointer-events: auto;
  position: absolute;
  text-shadow: 1px 1px #000;
  top: 397px;
  width: 182px;
}
.sl-defensive-style-cross { height: 30px; position: relative; width: 58px; }
.sl-defensive-style-cross::before,
.sl-defensive-style-cross::after { background: #120f0b; content: ""; height: 3px; left: 4px; position: absolute; top: 14px; width: 50px; }
.sl-defensive-style-cross::before { transform: rotate(37deg); }
.sl-defensive-style-cross::after { transform: rotate(-37deg); }
.sl-defensive-style-message { flex: 1; text-align: center; }

.sl-tile-layer svg { display: block; height: 100%; width: 100%; }
.sl-hovered-tile { fill: rgba(255, 255, 255, .12); shape-rendering: geometricPrecision; stroke: none; }
.sl-destination-tile { fill: rgba(0, 210, 255, .16); shape-rendering: geometricPrecision; stroke: none; }

.sl-ground-item-scene { height: 100%; position: absolute; width: 100%; }
.sl-player-name-scene { height: 100%; position: absolute; width: 100%; }
.sl-ground-item-label {
  color: #fff;
  /* RuneLite uses this TTF at Java2D size 16. Its browser glyph metrics render
     at roughly twice that visual height, so 8 CSS px is the matching scale. */
  font: 8px/8px "Solanascape Deck RuneScape Small", sans-serif;
  font-kerning: none;
  left: 0;
  position: absolute;
  text-rendering: optimizeSpeed;
  text-shadow: 1px 1px #000;
  top: 0;
  transition: transform 120ms linear;
  white-space: nowrap;
  will-change: transform;
}
.sl-player-name-label {
  color: #fffd7a;
  font: 8px/8px "Solanascape Deck RuneScape Small", sans-serif;
  font-kerning: none;
  left: 0;
  position: absolute;
  text-rendering: optimizeSpeed;
  text-shadow: 1px 1px #000;
  top: 0;
  transition: none;
  transform: translate(-50%, -100%);
  white-space: nowrap;
  will-change: transform;
}
.sl-player-name-local { color: #73ff7b; }

.sl-combat-layer { height: 503px; width: 765px; }
.sl-combat-scene { height: 503px; position: absolute; transform: scale(var(--sl-canvas-scale-x, 1), var(--sl-canvas-scale-y, 1)); transform-origin: left top; width: 765px; }
.sl-opponent-panel { background: var(--rl-overlay); border: 1px solid rgba(56, 49, 40, .92); box-shadow: inset 0 0 0 1px rgba(84, 73, 60, .9), 1px 2px 3px rgba(0,0,0,.65); left: 24px; min-height: 26px; padding: 2px 3px 3px; position: absolute; top: 8px; width: 97px; }
.sl-opponent-panel[hidden] { display: none; }
.sl-opponent-name { color: white; font-size: 10px; line-height: 12px; overflow: hidden; text-align: center; text-overflow: ellipsis; text-shadow: 1px 1px #000; white-space: nowrap; }
.sl-opponent-track { background: rgba(102, 15, 16, .9); border: 1px solid rgba(0,0,0,.65); height: 10px; overflow: hidden; position: relative; }
.sl-opponent-fill { background: rgba(0, 146, 54, .92); height: 100%; transition: width .18s linear; }
.sl-opponent-label { color: white; font-family: Arial, sans-serif; font-size: 8px; inset: 0; line-height: 8px; position: absolute; text-align: center; text-shadow: 1px 1px #000; }

@media (max-width: 600px) {
  .sl-panel, .sl-panel.sl-collapsed { max-height: 62vh; min-width: 280px; right: 8px; top: 70px; width: min(350px, calc(100vw - 16px)); }
  .sl-attack-style-hud { right: 33%; bottom: 34%; min-width: 53px; }
  .sl-overlay-menu { grid-template-columns: 1fr; }
}
.sl-panel.sl-lite-panel { min-width: 0; width: 220px; }

/* Unified Solanascape Deck settings interface. The frame, buttons, wrench,
   close control, and checkboxes use authentic OSRS sprites. */
.deck-settings-layer {
  contain: layout paint;
  overflow: hidden;
  pointer-events: none;
  position: fixed;
}
.deck-settings-layer[hidden] { display: none; }
.deck-settings-scene {
  height: 100%;
  position: absolute;
  width: 100%;
}
.deck-settings-gear {
  appearance: none;
  background: url("${OSRS_UI_ASSETS.wrench}") center / 21px 21px no-repeat;
  border: 0;
  cursor: pointer;
  height: 21px;
  image-rendering: pixelated;
  padding: 0;
  pointer-events: auto;
  position: absolute;
  right: 8px;
  top: 5px;
  width: 21px;
}
.deck-settings-gear:hover,
.deck-settings-gear[aria-expanded="true"] { background-image: url("${OSRS_UI_ASSETS.wrenchHovered}"); }
.deck-modal-backdrop {
  align-items: center;
  background: rgba(0, 0, 0, .52);
  display: flex;
  height: 100%;
  justify-content: center;
  left: 0;
  pointer-events: auto;
  position: absolute;
  top: 0;
  width: 100%;
}
.deck-modal-backdrop[hidden] { display: none; }
.deck-modal {
  background: #403a30 url("${OSRS_UI_ASSETS.background}") repeat;
  border: 9px solid transparent;
  border-image: url("${OSRS_UI_ASSETS.border}") 9 repeat;
  color: white;
  display: grid;
  font-family: "Solanascape Deck RuneScape Small", sans-serif;
  font-size: 11px;
  grid-template-rows: 24px 1fr;
  height: min(302px, calc(100% - 16px));
  image-rendering: pixelated;
  overflow: hidden;
  text-shadow: 1px 1px #000;
  width: min(486px, calc(100% - 16px));
}
.deck-modal-titlebar {
  align-items: center;
  background: rgba(22, 20, 17, .36);
  border-bottom: 1px solid rgba(14, 13, 11, .72);
  display: flex;
  margin: -5px -5px 0;
  min-width: 0;
  padding-left: 8px;
}
.deck-modal-title {
  color: #ff981f;
  flex: 1;
  font-size: 13px;
  text-align: center;
}
.deck-modal-close {
  appearance: none;
  background: url("${OSRS_UI_ASSETS.close}") center / 26px 23px no-repeat;
  border: 0;
  cursor: pointer;
  height: 23px;
  margin-right: 1px;
  padding: 0;
  width: 26px;
}
.deck-modal-close:hover { background-image: url("${OSRS_UI_ASSETS.closeHovered}"); }
.deck-modal-body {
  display: grid;
  grid-template-columns: 76px 1fr;
  min-height: 0;
}
.deck-category-nav {
  border-right: 1px solid rgba(24, 21, 17, .7);
  display: flex;
  flex-direction: column;
  gap: 0;
  padding: 3px 3px 3px 0;
}
.deck-category-button,
.deck-stone-button {
  appearance: none;
  background: url("${OSRS_UI_ASSETS.button}") center / 100% 100% no-repeat;
  border: 0;
  color: #ff981f;
  cursor: pointer;
  font: 11px "Solanascape Deck RuneScape Small", sans-serif;
  min-height: 24px;
  padding: 1px 4px;
  text-shadow: 1px 1px #000;
}
.deck-category-button:hover,
.deck-category-button[aria-pressed="true"],
.deck-stone-button:hover { color: #fff; filter: brightness(1.15); }
.deck-settings-content {
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  padding: 2px 4px 5px;
  scrollbar-color: #786b55 #211d17;
  scrollbar-width: thin;
}
.deck-settings-content::-webkit-scrollbar { width: 12px; }
.deck-settings-content::-webkit-scrollbar-track { background: #211d17; border-left: 1px solid #0f0d0b; }
.deck-settings-content::-webkit-scrollbar-thumb { background: #786b55; border: 2px solid #211d17; }
.deck-category-panel[hidden] { display: none; }
.deck-section-title {
  background: rgba(21, 19, 16, .26);
  border-bottom: 1px solid rgba(39, 34, 27, .72);
  color: white;
  font-size: 11px;
  font-weight: 400;
  line-height: 18px;
  margin: 1px 0;
  text-align: center;
}
.deck-setting-row {
  align-items: center;
  border-bottom: 1px solid rgba(55, 48, 39, .38);
  cursor: pointer;
  display: flex;
  gap: 6px;
  min-height: 29px;
  padding: 2px 4px;
}
.deck-setting-row[hidden] { display: none; }
.deck-setting-row:hover { background: rgba(255, 255, 255, .035); }
.deck-setting-copy { display: flex; flex: 1; flex-direction: column; min-width: 0; }
.deck-setting-name { color: #ff981f; font-size: 11px; line-height: 12px; }
.deck-setting-description { color: #d0c8b8; font-size: 9px; line-height: 10px; }
.deck-setting-row input[type="checkbox"] { height: 1px; opacity: 0; position: absolute; width: 1px; }
.deck-input-row { cursor: default; }
.deck-checkbox {
  background: url("${OSRS_UI_ASSETS.checkbox}") center / 16px 16px no-repeat;
  flex: 0 0 16px;
  height: 16px;
  width: 16px;
}
.deck-setting-row input:checked + .deck-checkbox { background-image: url("${OSRS_UI_ASSETS.checkboxChecked}"); }
.deck-setting-row input:focus-visible + .deck-checkbox { filter: brightness(1.4); }
.deck-action-row { cursor: default; }
.deck-stone-button { flex: 0 0 72px; min-height: 23px; }
.deck-text-input {
  background: rgba(14, 13, 11, .5);
  border: 1px solid rgba(94, 82, 65, .72);
  color: white;
  flex: 0 0 116px;
  font: 11px "Solanascape Deck RuneScape Small", sans-serif;
  min-width: 0;
  padding: 3px 4px;
  text-shadow: 1px 1px #000;
}
.deck-text-input::placeholder { color: #8f8676; }
.deck-overview { color: #d8d1c4; line-height: 1.25; padding: 5px 8px 8px; text-align: center; }
.deck-overview p { margin: 4px 0 0; }
.deck-overview-title { color: #ff981f; font-size: 14px; }
.deck-hook-status,
.deck-readout {
  background: rgba(14, 13, 11, .35);
  border: 1px solid rgba(94, 82, 65, .62);
  color: #d0c8b8;
  line-height: 1.25;
  margin: 3px;
  padding: 3px 5px;
  text-align: center;
}
.deck-hook-status.deck-live { color: #56e76a; }
`;
