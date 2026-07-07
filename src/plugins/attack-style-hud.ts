import type { PluginContext, SolanaPlugin } from "../plugin-manager";
import type { ObserverUpdate } from "../types";

export class AttackStyleHudPlugin implements SolanaPlugin {
  readonly id = "attack-style-hud";
  readonly requiredCapabilities = Object.freeze(["attackStyle"] as const);
  readonly requiredSlices = Object.freeze([]);

  private layer: HTMLDivElement | null = null;
  private hud: HTMLDivElement | null = null;
  private title: HTMLDivElement | null = null;
  private available = false;
  private context: PluginContext | null = null;
  private renderedStyle: string | null = null;
  private readonly resizeBound = (): void => this.syncToCanvas();

  mount(context: PluginContext): void {
    this.context = context;
    const layer = document.createElement("div");
    layer.className = "sl-attack-style-layer";
    layer.hidden = true;
    const hud = document.createElement("div");
    hud.className = "sl-attack-style-hud";
    hud.setAttribute("role", "status");
    hud.setAttribute("aria-label", "Current attack style");
    const title = document.createElement("div");
    title.className = "sl-attack-style-title";
    hud.append(title);
    layer.append(hud);
    context.shadowRoot.append(layer);
    this.layer = layer;
    this.hud = hud;
    this.title = title;
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
    const style = update.snapshot?.ingame ? update.snapshot.attackStyle : null;
    if (!this.layer || !this.title || !this.available || !style || !this.context?.settings.get().showAttackStyle) {
      if (this.layer) this.layer.hidden = true;
      this.renderedStyle = null;
      return;
    }
    if (this.renderedStyle !== style.name) {
      this.title.textContent = style.name;
      this.renderedStyle = style.name;
    }
    this.layer.hidden = false;
  }

  unmount(): void {
    window.removeEventListener("resize", this.resizeBound);
    window.removeEventListener("scroll", this.resizeBound);
    this.layer?.remove();
    this.layer = null;
    this.hud = null;
    this.title = null;
    this.context = null;
    this.renderedStyle = null;
  }

  private syncToCanvas(): void {
    if (!this.layer) return;
    const canvas = document.querySelector<HTMLCanvasElement>("canvas#canvas");
    const rect = canvas?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) {
      this.layer.hidden = true;
      return;
    }
    this.layer.style.left = `${Math.round(rect.left)}px`;
    this.layer.style.top = `${Math.round(rect.top)}px`;
    this.layer.style.width = `${Math.round(rect.width)}px`;
    this.layer.style.height = `${Math.round(rect.height)}px`;
  }
}
