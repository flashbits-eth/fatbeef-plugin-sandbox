import { SOLANASCAPE_DECK_STYLES } from "./styles";

export interface SolanascapeDeckUiRoot {
  readonly host: HTMLDivElement;
  readonly shadowRoot: ShadowRoot;
  destroy(): void;
}

export function createUiRoot(documentRef: Document = document): SolanascapeDeckUiRoot {
  const existing = documentRef.getElementById("solanascape-deck-root");
  existing?.remove();
  const host = documentRef.createElement("div");
  host.id = "solanascape-deck-root";
  host.setAttribute("data-solanascape-deck", "v1");
  const shadowRoot = host.attachShadow({ mode: "open" });
  const style = documentRef.createElement("style");
  style.textContent = SOLANASCAPE_DECK_STYLES;
  shadowRoot.append(style);
  (documentRef.body ?? documentRef.documentElement).append(host);
  return Object.freeze({ host, shadowRoot, destroy: () => host.remove() });
}
