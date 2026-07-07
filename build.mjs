import { readFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const packageJson = JSON.parse(await readFile(new URL("./package.json", import.meta.url), "utf8"));
const version = packageJson.version;
const banner = `// ==UserScript==
// @name         Solanascape Deck
// @namespace    https://solanascape.online/
// @version      ${version}
// @description  Unified OSRS-style overlays, alerts, tile indicators, and native menu swaps for Solanascape.
// @author       Solanascape Deck contributors
// @match        https://solanascape.online/play*
// @homepageURL  https://github.com/flashbits-eth/solanascape-deck
// @supportURL   https://github.com/flashbits-eth/solanascape-deck/issues
// @downloadURL  https://raw.githubusercontent.com/flashbits-eth/solanascape-deck/main/dist/solanascape-deck.user.js
// @updateURL    https://raw.githubusercontent.com/flashbits-eth/solanascape-deck/main/dist/solanascape-deck.user.js
// @run-at       document-start
// @noframes
// @grant        unsafeWindow
// ==/UserScript==`;

await mkdir(new URL("./dist/", import.meta.url), { recursive: true });

await build({
  entryPoints: [fileURLToPath(new URL("./src/main.ts", import.meta.url))],
  outfile: fileURLToPath(new URL("./dist/solanascape-deck.user.js", import.meta.url)),
  bundle: true,
  banner: { js: banner },
  define: {
    __SOLANASCAPE_DECK_VERSION__: JSON.stringify(version),
  },
  format: "iife",
  legalComments: "none",
  loader: { ".png": "dataurl", ".ttf": "dataurl" },
  minify: false,
  platform: "browser",
  sourcemap: false,
  target: ["es2022"],
});

console.log(`Built Solanascape Deck v${version}`);
