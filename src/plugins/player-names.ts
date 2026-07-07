import type { PluginContext, SolanaPlugin } from "../plugin-manager";
import type { NearbyPlayerState, ObserverUpdate, ProjectedPlayerState } from "../types";

export class PlayerNamesPlugin implements SolanaPlugin {
  readonly id = "player-names";
  readonly requiredCapabilities = Object.freeze(["players", "projection", "player"] as const);
  readonly requiredSlices = Object.freeze([]);

  private context: PluginContext | null = null;
  private layer: HTMLDivElement | null = null;
  private scene: HTMLDivElement | null = null;
  private hasPlayers = false;
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

  mount(context: PluginContext): void {
    this.context = context;
    const layer = document.createElement("div");
    layer.className = "sl-player-name-layer";
    layer.hidden = true;
    const scene = document.createElement("div");
    scene.className = "sl-player-name-scene";
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
    this.hasPlayers = false;
  }

  private shouldRender(): boolean {
    return Boolean(
      this.available && this.ingame &&
      this.context?.settings.get().showPlayerNames &&
      this.context.getPlayers &&
      this.context.projectPlayers,
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
    const players = this.context?.getPlayers?.() ?? Object.freeze([]);
    this.hasPlayers = players.length > 0;
    if (!this.hasPlayers) {
      this.clear();
      return;
    }
    const projected = this.context?.projectPlayers?.(players) ?? Object.freeze([]);

    const used = new Set<string>();
    let rendered = 0;
    for (const player of projected) {
      if (player.point.x < 4 || player.point.x >= 516 || player.point.y < 4 || player.point.y >= 338) continue;
      if (rendered >= 32) break;
      const key = String(player.slot);
      used.add(key);
      let label = this.labels.get(key);
      if (!label) {
        label = document.createElement("div");
        label.className = player.local ? "sl-player-name-label sl-player-name-local" : "sl-player-name-label";
        label.style.transform = this.labelTransform(player);
        this.labels.set(key, label);
        this.scene?.append(label);
      }
      const text = this.formatLabel(player);
      if (label.textContent !== text) label.textContent = text;
      label.style.transform = this.labelTransform(player);
      rendered += 1;
    }

    if (rendered === 0) {
      this.clear();
      return;
    }

    for (const [key, label] of this.labels) {
      if (used.has(key)) continue;
      label.remove();
      this.labels.delete(key);
    }
    this.layer.hidden = false;
  }

  private formatLabel(player: ProjectedPlayerState): string {
    const name = player.name ?? `Player ${player.slot}`;
    return player.combatLevel === null ? name : `${name} level-${player.combatLevel}`;
  }

  private labelTransform(player: ProjectedPlayerState): string {
    return `translate3d(${player.point.x * this.scaleX}px, ${player.point.y * this.scaleY}px, 0) translate(-50%, -100%)`;
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
