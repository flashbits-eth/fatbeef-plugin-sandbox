import type { PluginContext, SolanaPlugin } from "../plugin-manager";
import type { ObserverUpdate } from "../types";

export class CombatHudPlugin implements SolanaPlugin {
  readonly id = "combat-hud";
  readonly requiredCapabilities = Object.freeze(["opponent"] as const);
  readonly requiredSlices = Object.freeze([]);

  private context: PluginContext | null = null;
  private layer: HTMLDivElement | null = null;
  private opponent: HTMLDivElement | null = null;
  private opponentName: HTMLDivElement | null = null;
  private opponentFill: HTMLDivElement | null = null;
  private opponentLabel: HTMLSpanElement | null = null;
  private available = false;
  private renderKey = "";
  private readonly resizeBound = (): void => this.syncToCanvas();

  mount(context: PluginContext): void {
    this.context = context;
    const layer = document.createElement("div");
    layer.className = "sl-combat-layer";
    layer.hidden = true;
    const scene = document.createElement("div");
    scene.className = "sl-combat-scene";

    const opponent = document.createElement("div");
    opponent.className = "sl-opponent-panel";
    opponent.hidden = true;
    const opponentName = document.createElement("div");
    opponentName.className = "sl-opponent-name";
    const track = document.createElement("div");
    track.className = "sl-opponent-track";
    const opponentFill = document.createElement("div");
    opponentFill.className = "sl-opponent-fill";
    const opponentLabel = document.createElement("span");
    opponentLabel.className = "sl-opponent-label";
    track.append(opponentFill, opponentLabel);
    opponent.append(opponentName, track);
    scene.append(opponent);
    layer.append(scene);
    context.shadowRoot.append(layer);

    this.layer = layer;
    this.opponent = opponent;
    this.opponentName = opponentName;
    this.opponentFill = opponentFill;
    this.opponentLabel = opponentLabel;
    window.addEventListener("resize", this.resizeBound);
    window.addEventListener("scroll", this.resizeBound, { passive: true });
    this.syncToCanvas();
  }

  onAvailability(available: boolean): void {
    this.available = available;
    this.renderKey = "";
    if (!available && this.layer) this.layer.hidden = true;
  }

  onUpdate(update: ObserverUpdate): void {
    if (update.clientChanged) this.syncToCanvas();
    const snapshot = update.snapshot;
    const settings = this.context?.settings.get();
    const opponent = settings?.showOpponentInfo ? snapshot?.opponent ?? null : null;
    const key = this.available && snapshot?.ingame && opponent
      ? [opponent.slot, opponent.healthRatio, opponent.healthScale].join("|")
      : "hidden";
    if (key === this.renderKey) return;
    this.renderKey = key;

    if (key === "hidden" || !opponent) {
      if (this.layer) this.layer.hidden = true;
      return;
    }
    if (this.opponent) this.opponent.hidden = false;
    if (this.opponentName && this.opponentFill && this.opponentLabel) {
      this.opponentName.textContent = opponent.name ?? `NPC ${opponent.id ?? opponent.slot}`;
      this.opponentFill.style.width = `${opponent.healthPercent}%`;
      this.opponentLabel.textContent = `${Math.round(opponent.healthPercent)}%`;
    }
    if (this.layer) this.layer.hidden = false;
  }

  unmount(): void {
    window.removeEventListener("resize", this.resizeBound);
    window.removeEventListener("scroll", this.resizeBound);
    this.layer?.remove();
    this.context = null;
    this.layer = null;
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
    this.layer.style.setProperty("--sl-canvas-scale-x", String(rect.width / 765));
    this.layer.style.setProperty("--sl-canvas-scale-y", String(rect.height / 503));
  }
}
