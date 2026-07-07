import type { PluginContext, SolanaPlugin } from "../plugin-manager";
import type { ObserverUpdate, ProjectedTileState } from "../types";

const SVG_NS = "http://www.w3.org/2000/svg";

export class TileOverlayPlugin implements SolanaPlugin {
  readonly id = "tile-overlay";
  readonly requiredCapabilities = Object.freeze(["projection", "player"] as const);
  readonly requiredSlices = Object.freeze([]);

  private context: PluginContext | null = null;
  private layer: HTMLDivElement | null = null;
  private svg: SVGSVGElement | null = null;
  private polygons: SVGGElement | null = null;
  private available = false;
  private ingame = false;
  private destinationActive = false;
  private frameRequest: number | null = null;
  private readonly resizeBound = (): void => this.syncToCanvas();
  private readonly frameBound = (): void => {
    this.frameRequest = null;
    this.renderTiles();
    this.syncFrameLoop();
  };

  mount(context: PluginContext): void {
    this.context = context;
    const layer = document.createElement("div");
    layer.className = "sl-tile-layer";
    layer.hidden = true;
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 765 503");
    svg.setAttribute("preserveAspectRatio", "none");
    svg.setAttribute("aria-hidden", "true");
    const definitions = document.createElementNS(SVG_NS, "defs");
    const clipPath = document.createElementNS(SVG_NS, "clipPath");
    clipPath.id = "sl-scene-clip";
    const clipRect = document.createElementNS(SVG_NS, "rect");
    clipRect.setAttribute("x", "4");
    clipRect.setAttribute("y", "4");
    clipRect.setAttribute("width", "512");
    clipRect.setAttribute("height", "334");
    clipPath.append(clipRect);
    definitions.append(clipPath);
    const polygons = document.createElementNS(SVG_NS, "g");
    polygons.setAttribute("clip-path", "url(#sl-scene-clip)");
    svg.append(definitions, polygons);
    layer.append(svg);
    context.shadowRoot.append(layer);
    this.layer = layer;
    this.svg = svg;
    this.polygons = polygons;
    window.addEventListener("resize", this.resizeBound);
    window.addEventListener("scroll", this.resizeBound, { passive: true });
    this.syncToCanvas();
  }

  onAvailability(available: boolean): void {
    this.available = available;
    if (!available) {
      this.destinationActive = false;
      if (this.layer) this.layer.hidden = true;
    }
    this.syncFrameLoop();
  }

  onUpdate(update: ObserverUpdate): void {
    if (update.clientChanged) this.syncToCanvas();
    this.ingame = update.snapshot?.ingame ?? false;
    this.renderTiles();
    this.syncFrameLoop();
  }

  private renderTiles(): void {
    const showHovered = this.context?.settings.get().showHoveredTile ?? false;
    const showDestination = this.context?.settings.get().showDestinationTile ?? false;
    const hovered = showHovered && this.available && this.ingame ? this.context?.getHoveredTile?.() ?? null : null;
    const destination = showDestination && this.available && this.ingame ? this.context?.getDestinationTile?.() ?? null : null;
    this.destinationActive = destination !== null;
    if (!hovered && !destination) {
      this.polygons?.replaceChildren();
      if (this.layer) this.layer.hidden = true;
      return;
    }
    const polygons: SVGPolygonElement[] = [];
    if (destination) polygons.push(this.createPolygon(destination, "sl-destination-tile"));
    if (hovered) polygons.push(this.createPolygon(hovered, "sl-hovered-tile"));
    this.polygons?.replaceChildren(...polygons);
    if (this.layer) this.layer.hidden = false;
  }

  unmount(): void {
    window.removeEventListener("resize", this.resizeBound);
    window.removeEventListener("scroll", this.resizeBound);
    if (this.frameRequest !== null) window.cancelAnimationFrame(this.frameRequest);
    this.frameRequest = null;
    this.destinationActive = false;
    this.layer?.remove();
    this.context = null;
    this.layer = null;
    this.svg = null;
    this.polygons = null;
  }

  private syncFrameLoop(): void {
    const settings = this.context?.settings.get();
    const shouldRun = this.available && this.ingame && Boolean(settings?.showHoveredTile || this.destinationActive);
    if (shouldRun && this.frameRequest === null) this.frameRequest = window.requestAnimationFrame(this.frameBound);
    if (!shouldRun && this.frameRequest !== null) {
      window.cancelAnimationFrame(this.frameRequest);
      this.frameRequest = null;
    }
  }

  private createPolygon(tile: ProjectedTileState, className: string): SVGPolygonElement {
    const polygon = document.createElementNS(SVG_NS, "polygon");
    polygon.setAttribute("points", tile.points.map((point) => `${point.x},${point.y}`).join(" "));
    polygon.setAttribute("class", className);
    return polygon;
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
  }
}
