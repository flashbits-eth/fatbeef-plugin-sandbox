import { SolanaClientAdapter } from "./adapter";
import type { CapabilityMap, ClientSnapshot, ObserverUpdate, SnapshotSlice } from "./types";

type ObserverListener = (update: ObserverUpdate) => void;

export class ClientObserver {
  private adapter: SolanaClientAdapter | null = null;
  private client: unknown = null;
  private previous: ClientSnapshot | null = null;
  private timer: number | null = null;
  private readonly listeners = new Set<ObserverListener>();

  constructor(
    private readonly pageWindow: Window,
    private readonly slices: ReadonlySet<SnapshotSlice> | (() => ReadonlySet<SnapshotSlice>),
    private readonly intervalMs = 250,
  ) {}

  start(): void {
    if (this.timer !== null) return;
    this.tick();
    this.timer = window.setInterval(() => this.tick(), this.intervalMs);
  }

  stop(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
  }

  subscribe(listener: ObserverListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getAdapter(): SolanaClientAdapter | null {
    return this.adapter;
  }

  getSnapshot(): ClientSnapshot | null {
    return this.previous;
  }

  getCapabilities(): CapabilityMap {
    return this.adapter?.getCapabilities() ?? new SolanaClientAdapter(null).getCapabilities();
  }

  private tick(): void {
    const nextClient = this.pageWindow.gameClient ?? null;
    const clientChanged = nextClient !== this.client;
    if (clientChanged) {
      this.client = nextClient;
      this.adapter = nextClient === null ? null : new SolanaClientAdapter(nextClient);
    }
    const at = Date.now();
    const slices = typeof this.slices === "function" ? this.slices() : this.slices;
    const snapshot = this.adapter?.readSnapshot(at, document.visibilityState === "visible", slices) ?? null;
    let activeDeltaMs = 0;
    if (
      !clientChanged &&
      snapshot?.ingame &&
      snapshot.visible &&
      this.previous?.ingame &&
      this.previous.visible
    ) {
      activeDeltaMs = Math.max(0, Math.min(1_000, snapshot.at - this.previous.at));
    }
    const update: ObserverUpdate = Object.freeze({
      snapshot,
      previous: this.previous,
      capabilities: this.adapter?.getCapabilities() ?? new SolanaClientAdapter(null).getCapabilities(),
      activeDeltaMs,
      clientChanged,
    });
    this.previous = snapshot;
    for (const listener of this.listeners) listener(update);
  }
}
