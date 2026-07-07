import { readCurrentSideTab } from "../defensive-style-guard";
import type { PluginContext, SolanaPlugin } from "../plugin-manager";
import type { ObserverUpdate } from "../types";

export class DefensiveStyleGuardPlugin implements SolanaPlugin {
  readonly id = "defensive-style-guard";
  readonly requiredCapabilities = Object.freeze(["session"] as const);
  readonly requiredSlices = Object.freeze([]);

  private context: PluginContext | null = null;
  private layer: HTMLDivElement | null = null;
  private blocker: HTMLDivElement | null = null;
  private available = false;
  private readonly resizeBound = (): void => this.syncToCanvas();

  mount(context: PluginContext): void {
    this.context = context;
    const layer = document.createElement("div");
    layer.className = "sl-defensive-style-layer";
    layer.hidden = true;
    const scene = document.createElement("div");
    scene.className = "sl-defensive-style-scene";
    const blocker = document.createElement("div");
    blocker.className = "sl-defensive-style-blocker";
    blocker.setAttribute("role", "status");
    blocker.setAttribute("aria-label", "Defensive combat style hidden");
    blocker.title = "Defensive style hidden by Fatbeef Plugin Sandbox";
    blocker.addEventListener("contextmenu", (event) => event.preventDefault());
    const cross = document.createElement("span");
    cross.className = "sl-defensive-style-cross";
    const message = document.createElement("span");
    message.className = "sl-defensive-style-message";
    message.textContent = "Defensive style hidden";
    blocker.append(cross, message);
    scene.append(blocker);
    layer.append(scene);
    context.shadowRoot.append(layer);
    this.layer = layer;
    this.blocker = blocker;
    window.addEventListener("resize", this.resizeBound);
    window.addEventListener("scroll", this.resizeBound, { passive: true });
    this.syncToCanvas();
  }

  onAvailability(available: boolean): void {
    this.available = available;
    if (!available && this.layer) this.layer.hidden = true;
  }

  onUpdate(update: ObserverUpdate): void {
    if (update.clientChanged) this.syncToCanvas();
    const enabled = this.context?.settings.get().hideDefensiveStyle ?? false;
    const currentTab = readCurrentSideTab(this.context?.getClient?.());
    const visible = Boolean(enabled && this.available && update.snapshot?.ingame && currentTab === 0);
    if (this.layer) this.layer.hidden = !visible;
  }

  unmount(): void {
    window.removeEventListener("resize", this.resizeBound);
    window.removeEventListener("scroll", this.resizeBound);
    this.layer?.remove();
    this.context = null;
    this.layer = null;
    this.blocker = null;
  }

  private syncToCanvas(): void {
    if (!this.layer) return;
    const rect = document.querySelector<HTMLCanvasElement>("canvas#canvas")?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) {
      this.layer.hidden = true;
      return;
    }
    this.layer.style.left = `${Math.round(rect.left)}px`;
    this.layer.style.top = `${Math.round(rect.top)}px`;
    this.layer.style.width = `${Math.round(rect.width)}px`;
    this.layer.style.height = `${Math.round(rect.height)}px`;
    this.layer.style.setProperty("--sl-canvas-scale-x", String(rect.width / 765));
    this.layer.style.setProperty("--sl-canvas-scale-y", String(rect.height / 503));
  }
}
