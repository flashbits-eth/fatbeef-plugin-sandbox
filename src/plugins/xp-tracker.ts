import type { PluginContext, SolanaPlugin } from "../plugin-manager";
import { xpProgress } from "../experience";
import { SKILL_ICONS } from "../skill-assets";
import type { ObserverUpdate, SkillState } from "../types";

const numberFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const SVG_NS = "http://www.w3.org/2000/svg";

function createElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

interface ActiveGlobe {
  readonly element: HTMLDivElement;
  fadeAt: number;
  expiresAt: number;
  updatedAt: number;
}

export class XpTrackerPlugin implements SolanaPlugin {
  readonly id = "xp-drops-controls";
  readonly requiredCapabilities = Object.freeze(["skills"] as const);
  readonly requiredSlices = Object.freeze(["skills"] as const);

  private context: PluginContext | null = null;
  private dropLayer: HTMLDivElement | null = null;
  private dropLane: HTMLDivElement | null = null;
  private globeLane: HTMLDivElement | null = null;
  private readonly globes = new Map<number, ActiveGlobe>();
  private available = false;
  private readonly resizeBound = (): void => this.syncPlacement();

  mount(context: PluginContext): void {
    this.context = context;
    this.buildOverlay(context);
    window.addEventListener("resize", this.resizeBound);
    window.addEventListener("scroll", this.resizeBound, { passive: true });
    this.syncPlacement();
  }

  onAvailability(available: boolean): void {
    this.available = available;
  }

  onUpdate(update: ObserverUpdate): void {
    this.emitXpDrops(update);
    this.pruneXpGlobes(Date.now());
    if (update.clientChanged) this.syncPlacement();
  }

  unmount(): void {
    window.removeEventListener("resize", this.resizeBound);
    window.removeEventListener("scroll", this.resizeBound);
    this.dropLayer?.remove();
    this.dropLayer = null;
    this.dropLane = null;
    this.globeLane = null;
    this.globes.clear();
    this.context = null;
  }

  resetSession(): void {
    this.dropLane?.replaceChildren();
    this.clearXpGlobes();
  }

  private buildOverlay(context: PluginContext): void {
    const dropLayer = createElement("div", "sl-xp-drop-layer");
    const scene = createElement("div", "sl-xp-scene");
    const dropLane = createElement("div", "sl-xp-drop-lane");
    dropLane.setAttribute("aria-hidden", "true");
    const globeLane = createElement("div", "sl-xp-globe-lane");
    scene.append(dropLane, globeLane);
    dropLayer.append(scene);

    context.shadowRoot.append(dropLayer);
    this.dropLayer = dropLayer;
    this.dropLane = dropLane;
    this.globeLane = globeLane;
  }

  private emitXpDrops(update: ObserverUpdate): void {
    if (!this.dropLane || !this.globeLane || !this.context) return;
    const settings = this.context.settings.get();
    if (!settings.showXpDrops && !settings.showXpGlobes) return;
    const current = update.snapshot;
    const previous = update.previous;
    if (
      update.clientChanged || !current?.visible || !current.ingame || !current.skills ||
      !previous?.ingame || !previous.skills ||
      (current.username !== null && previous.username !== null && current.username !== previous.username)
    ) return;
    for (const skill of current.skills) {
      const before = previous.skills[skill.id];
      if (!before) continue;
      const delta = Math.floor(skill.xp - before.xp);
      if (delta > 0 && delta < 100_000_000) {
        if (settings.showXpDrops) this.addXpDrop(skill, delta);
        if (settings.showXpGlobes) this.addOrUpdateXpGlobe(skill);
      }
    }
  }

  private addXpDrop(skill: SkillState, delta: number): void {
    if (!this.dropLane) return;
    while (this.dropLane.childElementCount >= 6) this.dropLane.firstElementChild?.remove();
    const drop = createElement("div", "sl-xp-drop");
    const icon = createElement("img", "sl-xp-drop-icon");
    icon.src = SKILL_ICONS[skill.id] ?? "";
    icon.alt = "";
    drop.setAttribute("aria-label", `${skill.name}, plus ${numberFormatter.format(delta)} XP`);
    drop.append(
      icon,
      createElement("span", "sl-xp-drop-value", `+${numberFormatter.format(delta)} xp`),
    );
    this.dropLane.append(drop);
    window.setTimeout(() => drop.remove(), 1_850);
  }

  private addOrUpdateXpGlobe(skill: SkillState): void {
    if (!this.globeLane) return;
    const now = Date.now();
    let active = this.globes.get(skill.id);
    if (!active) {
      const globe = createElement("div", "sl-xp-globe");
      const progressSvg = document.createElementNS(SVG_NS, "svg");
      progressSvg.setAttribute("class", "sl-xp-globe-svg");
      progressSvg.setAttribute("viewBox", "-3 -3 46 46");
      progressSvg.setAttribute("aria-hidden", "true");
      const background = document.createElementNS(SVG_NS, "circle");
      background.setAttribute("class", "sl-xp-globe-background");
      background.setAttribute("cx", "20");
      background.setAttribute("cy", "20");
      background.setAttribute("r", "20");
      const track = document.createElementNS(SVG_NS, "circle");
      track.setAttribute("class", "sl-xp-globe-track");
      track.setAttribute("cx", "20");
      track.setAttribute("cy", "20");
      track.setAttribute("r", "20");
      const progressArc = document.createElementNS(SVG_NS, "circle");
      progressArc.setAttribute("class", "sl-xp-globe-progress");
      progressArc.setAttribute("cx", "20");
      progressArc.setAttribute("cy", "20");
      progressArc.setAttribute("r", "20");
      progressArc.setAttribute("pathLength", "100");
      progressArc.setAttribute("transform", "rotate(-90 20 20)");
      progressSvg.append(background, track, progressArc);
      const icon = createElement("img", "sl-xp-globe-icon");
      icon.alt = "";
      const tooltip = createElement("div", "sl-xp-globe-tooltip");
      globe.append(progressSvg, icon, tooltip);
      this.globeLane.append(globe);
      active = { element: globe, fadeAt: now + 4_250, expiresAt: now + 5_000, updatedAt: now };
      this.globes.set(skill.id, active);
    }

    const progress = xpProgress(skill.xp, skill.baseLevel);
    const icon = active.element.querySelector<HTMLImageElement>(".sl-xp-globe-icon");
    if (icon) icon.src = SKILL_ICONS[skill.id] ?? "";
    const progressArc = active.element.querySelector<SVGCircleElement>(".sl-xp-globe-progress");
    if (progressArc) progressArc.setAttribute("stroke-dasharray", `${progress.ratio * 100} 100`);
    active.element.setAttribute("aria-label", `${skill.name}, level ${skill.baseLevel}`);

    const tooltip = active.element.querySelector<HTMLDivElement>(".sl-xp-globe-tooltip");
    if (tooltip) {
      tooltip.replaceChildren(
        this.createTooltipRow(skill.name, String(skill.baseLevel)),
        this.createTooltipRow("Current XP:", numberFormatter.format(Math.floor(skill.xp)), true),
        this.createTooltipRow(
          progress.nextLevelXp === null ? "Status:" : "XP left:",
          progress.nextLevelXp === null ? "Max level" : numberFormatter.format(progress.remaining),
          true,
        ),
      );
    }
    active.element.classList.remove("sl-xp-globe-fading");
    active.fadeAt = now + 4_250;
    active.expiresAt = now + 5_000;
    active.updatedAt = now;

    if (this.globes.size > 5) {
      const oldest = [...this.globes.entries()].sort((left, right) => left[1].updatedAt - right[1].updatedAt)[0];
      if (oldest) this.removeXpGlobe(oldest[0]);
    }
  }

  private createTooltipRow(label: string, value: string, accent = false): HTMLDivElement {
    const row = createElement("div", "sl-xp-tooltip-row");
    row.append(
      createElement("span", accent ? "sl-xp-tooltip-label" : undefined, label),
      createElement("span", undefined, value),
    );
    return row;
  }

  private pruneXpGlobes(now: number): void {
    for (const [skillId, globe] of this.globes) {
      if (globe.element.matches(":hover")) {
        globe.element.classList.remove("sl-xp-globe-fading");
        globe.fadeAt = now + 4_250;
        globe.expiresAt = now + 5_000;
      } else if (globe.fadeAt <= now) {
        globe.element.classList.add("sl-xp-globe-fading");
      }
      if (globe.expiresAt <= now) this.removeXpGlobe(skillId);
    }
  }

  private removeXpGlobe(skillId: number): void {
    this.globes.get(skillId)?.element.remove();
    this.globes.delete(skillId);
  }

  private clearXpGlobes(): void {
    this.globeLane?.replaceChildren();
    this.globes.clear();
  }

  private syncPlacement(): void {
    if (!this.dropLayer || !this.context) return;
    const rect = document.querySelector<HTMLCanvasElement>("canvas#canvas")?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) {
      this.dropLayer.hidden = true;
      return;
    }
    const settings = this.context.settings.get();
    this.dropLayer.hidden = !settings.showXpDrops && !settings.showXpGlobes;
    this.dropLayer.style.left = `${Math.round(rect.left)}px`;
    this.dropLayer.style.top = `${Math.round(rect.top)}px`;
    this.dropLayer.style.width = `${Math.round(rect.width)}px`;
    this.dropLayer.style.height = `${Math.round(rect.height)}px`;
    this.dropLayer.style.setProperty("--sl-canvas-scale-x", String(rect.width / 765));
    this.dropLayer.style.setProperty("--sl-canvas-scale-y", String(rect.height / 503));
  }
}
