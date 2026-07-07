import { readFile } from "node:fs/promises";

const paths = [
  new URL("../dist/solanascape-deck.user.js", import.meta.url),
];

const forbidden = [
  ["fetch calls", /\bfetch\s*\(/],
  ["XMLHttpRequest", /\bXMLHttpRequest\b/],
  ["WebSocket", /\bWebSocket\b/],
  ["Tampermonkey network access", /GM_xmlhttpRequest|GM\.xmlHttpRequest/],
  ["synthetic DOM events", /\.dispatchEvent\s*\(|new\s+(?:KeyboardEvent|MouseEvent|PointerEvent)\b/],
  ["synthetic clicks", /\.click\s*\(/],
  ["gameplay mutator calls", /\.plugin(?:Set|Toggle|Sit|MobileLogin|Apply|ClearQuestHint)\w*\s*\(/],
];

const failures = [];
for (const path of paths) {
  const source = await readFile(path, "utf8");
  const name = path.pathname.split("/").pop();
  failures.push(...forbidden.filter(([, pattern]) => pattern.test(source)).map(([label]) => `${name}: ${label}`));
  const grants = [...source.matchAll(/^\/\/\s+@grant\s+(.+)$/gm)].map((match) => match[1]?.trim());
  if (grants.length !== 1 || grants[0] !== "unsafeWindow") {
    failures.push(`${name}: unexpected grants: ${grants.join(", ") || "none"}`);
  }
  if (!source.includes("@match        https://solanascape.online/play*")) {
    failures.push(`${name}: missing exact Solanascape match metadata`);
  }
}

if (failures.length > 0) {
  console.error(`Bundle audit failed:\n- ${failures.join("\n- ")}`);
  process.exitCode = 1;
} else {
  console.log("Bundle audit passed: local-only, no-network, no-synthetic-input boundary verified.");
}
