import { FATBEEF_PLUGIN_SANDBOX_STYLES } from "./styles";

export interface FatbeefPluginSandboxUiRoot {
  readonly host: HTMLDivElement;
  readonly shadowRoot: ShadowRoot;
  destroy(): void;
}

export function createUiRoot(documentRef: Document = document): FatbeefPluginSandboxUiRoot {
  const existing = documentRef.getElementById("fatbeef-plugin-sandbox-root");
  existing?.remove();
  const host = documentRef.createElement("div");
  host.id = "fatbeef-plugin-sandbox-root";
  host.setAttribute("data-fatbeef-plugin-sandbox", "v1");
  const shadowRoot = host.attachShadow({ mode: "open" });
  const style = documentRef.createElement("style");
  style.textContent = FATBEEF_PLUGIN_SANDBOX_STYLES;
  shadowRoot.append(style);
  (documentRef.body ?? documentRef.documentElement).append(host);
  return Object.freeze({ host, shadowRoot, destroy: () => host.remove() });
}
