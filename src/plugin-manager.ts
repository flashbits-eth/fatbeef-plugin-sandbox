import type { Capability, GroundItemState, MappingReport, NearbyPlayerState, ObserverUpdate, ProjectedGroundItemState, ProjectedPlayerState, ProjectedTileState, SnapshotSlice } from "./types";
import type { SettingsStore } from "./storage";

export interface PluginContext {
  readonly shadowRoot: ShadowRoot;
  readonly settings: SettingsStore;
  getClient?(): unknown;
  getHoveredTile?(): ProjectedTileState | null;
  getDestinationTile?(): ProjectedTileState | null;
  getPlayers?(): readonly NearbyPlayerState[];
  projectGroundItems?(items: readonly GroundItemState[]): readonly ProjectedGroundItemState[];
  projectPlayers?(players: readonly NearbyPlayerState[]): readonly ProjectedPlayerState[];
  getMappingReport(): MappingReport;
}

export interface SolanaPlugin {
  readonly id: string;
  readonly requiredCapabilities: readonly Capability[];
  readonly requiredSlices: readonly SnapshotSlice[];
  activeSlices?(): readonly SnapshotSlice[];
  mount(context: PluginContext): void;
  onAvailability(available: boolean, reasons: readonly string[]): void;
  onUpdate(update: ObserverUpdate): void;
  unmount(): void;
}

export class PluginManager {
  private readonly plugins: SolanaPlugin[] = [];
  private mounted = false;

  register(plugin: SolanaPlugin): void {
    if (this.mounted) throw new Error("Plugins must be registered before mounting.");
    if (this.plugins.some((entry) => entry.id === plugin.id)) throw new Error(`Duplicate plugin id: ${plugin.id}`);
    this.plugins.push(plugin);
  }

  mount(context: PluginContext): void {
    if (this.mounted) return;
    for (const plugin of this.plugins) plugin.mount(context);
    this.mounted = true;
  }

  update(update: ObserverUpdate): void {
    if (!this.mounted) return;
    for (const plugin of this.plugins) {
      const reasons = plugin.requiredCapabilities
        .map((capability) => update.capabilities[capability])
        .filter((status) => !status.available)
        .map((status) => status.reason ?? "Capability unavailable.");
      plugin.onAvailability(reasons.length === 0, Object.freeze(reasons));
      plugin.onUpdate(update);
    }
  }

  requiredSlices(): ReadonlySet<SnapshotSlice> {
    return new Set(this.plugins.flatMap((plugin) => plugin.activeSlices?.() ?? plugin.requiredSlices));
  }

  unmount(): void {
    for (const plugin of this.plugins) plugin.unmount();
    this.mounted = false;
  }
}
