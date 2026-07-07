import type { PluginContext, SolanaPlugin } from "../plugin-manager";
import type { GroundItemState, ObserverUpdate, ProjectedGroundItemState } from "../types";

export class GroundItemLabelsPlugin implements SolanaPlugin {
  readonly id = "ground-item-labels";
  readonly requiredCapabilities = Object.freeze(["groundItems", "projection", "player"] as const);
  readonly requiredSlices = Object.freeze(["groundItems"] as const);

  private context: PluginContext | null = null;
  private layer: HTMLDivElement | null = null;
  private scene: HTMLDivElement | null = null;
  private items: readonly GroundItemState[] = Object.freeze([]);
  private readonly labels = new Map<string, HTMLDivElement>();
  private available = false;
  private ingame = false;
  private frameRequest: number | null = null;
  private scaleX = 1;
  private scaleY = 1;
  private readonly resizeBound = (): void => this.syncToCanvas();
  private readonly frameBound = (): void => {
    this.frameRequest = null;
    this.renderFrame();
    this.syncFrameLoop();
  };

  activeSlices(): readonly ["groundItems"] | readonly [] {
    return this.context?.settings.get().showGroundItemLabels ? this.requiredSlices : Object.freeze([]);
  }

  mount(context: PluginContext): void {
    this.context = context;
    const layer = document.createElement("div");
    layer.className = "sl-ground-item-layer";
    layer.hidden = true;
    const scene = document.createElement("div");
    scene.className = "sl-ground-item-scene";
    layer.append(scene);
    context.shadowRoot.append(layer);
    this.layer = layer;
    this.scene = scene;
    window.addEventListener("resize", this.resizeBound);
    window.addEventListener("scroll", this.resizeBound, { passive: true });
    this.syncToCanvas();
  }

  onAvailability(available: boolean): void {
    this.available = available;
    if (!available) this.clear();
    this.syncFrameLoop();
  }

  onUpdate(update: ObserverUpdate): void {
    if (update.clientChanged) this.syncToCanvas();
    this.ingame = update.snapshot?.ingame ?? false;
    this.items = update.snapshot?.groundItems ?? Object.freeze([]);
    if (!this.shouldRender()) this.clear();
    this.syncFrameLoop();
  }

  unmount(): void {
    window.removeEventListener("resize", this.resizeBound);
    window.removeEventListener("scroll", this.resizeBound);
    if (this.frameRequest !== null) window.cancelAnimationFrame(this.frameRequest);
    this.frameRequest = null;
    this.labels.clear();
    this.layer?.remove();
    this.context = null;
    this.layer = null;
    this.scene = null;
    this.items = Object.freeze([]);
  }

  private shouldRender(): boolean {
    return Boolean(
      this.available && this.ingame && this.items.length > 0 &&
      this.context?.settings.get().showGroundItemLabels &&
      this.context.projectGroundItems,
    );
  }

  private syncFrameLoop(): void {
    const shouldRun = this.shouldRender();
    if (shouldRun && this.frameRequest === null) this.frameRequest = window.requestAnimationFrame(this.frameBound);
    if (!shouldRun && this.frameRequest !== null) {
      window.cancelAnimationFrame(this.frameRequest);
      this.frameRequest = null;
    }
  }

  private renderFrame(): void {
    if (!this.shouldRender() || !this.scene || !this.layer) return;
    const projected = this.context?.projectGroundItems?.(this.items) ?? Object.freeze([]);
    const visible = projected.filter((item) => item.point.x >= 4 && item.point.x < 516 && item.point.y >= 4 && item.point.y < 338);
    if (visible.length === 0) {
      this.clear();
      return;
    }

    const used = new Set<string>();
    const stackDepth = new Map<string, number>();
    visible.forEach((item, index) => {
      const tileKey = `${item.tile.level}:${item.tile.x}:${item.tile.z}`;
      const depth = stackDepth.get(tileKey) ?? 0;
      stackDepth.set(tileKey, depth + 1);
      const key = `${tileKey}:${item.id}:${index}`;
      used.add(key);
      let label = this.labels.get(key);
      if (!label) {
        label = document.createElement("div");
        label.className = "sl-ground-item-label";
        this.labels.set(key, label);
        this.scene?.append(label);
      }
      const text = this.formatLabel(item);
      if (label.textContent !== text) label.textContent = text;
      label.style.left = `${item.point.x * this.scaleX}px`;
      label.style.top = `${item.point.y * this.scaleY - depth * 15}px`;
    });

    for (const [key, label] of this.labels) {
      if (used.has(key)) continue;
      label.remove();
      this.labels.delete(key);
    }
    this.layer.hidden = false;
  }

  private formatLabel(item: ProjectedGroundItemState): string {
    const name = item.name ?? `Item ${item.id}`;
    return item.count > 1 ? `${name} (${this.formatStackSize(item.count)})` : name;
  }

  private formatStackSize(quantity: number): string {
    if (quantity < 10_000) return quantity.toLocaleString("en-US");
    const suffixes = ["", "K", "M", "B"] as const;
    const power = Math.min(3, Math.floor(Math.log10(quantity) / 3));
    const formatted = (quantity / 10 ** (power * 3)).toLocaleString("en-US", { maximumFractionDigits: 3 });
    const shortened = formatted.length > 4 ? formatted.slice(0, 4) : formatted;
    return `${shortened.endsWith(".") ? shortened.slice(0, -1) : shortened}${suffixes[power]}`;
  }

  private clear(): void {
    for (const label of this.labels.values()) label.remove();
    this.labels.clear();
    if (this.layer) this.layer.hidden = true;
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
    this.scaleX = rect.width / 765;
    this.scaleY = rect.height / 503;
  }
}
