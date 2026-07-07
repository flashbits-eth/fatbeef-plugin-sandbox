import { createToneBeeper } from "../audio-alert";
import type { PluginContext, SolanaPlugin } from "../plugin-manager";
import type { ObserverUpdate } from "../types";

const HITPOINTS_SKILL_ID = 3;
const LOW_HITPOINTS_THRESHOLD = 10;
const CRITICAL_HITPOINTS_THRESHOLD = 5;
const PRAYER_ALERT_GAIN = 0.055;
const HITPOINTS_ALERT_GAIN = PRAYER_ALERT_GAIN * 1.2;

export class HitpointsNotifierPlugin implements SolanaPlugin {
  readonly id = "hitpoints-notifier";
  readonly requiredCapabilities = Object.freeze(["skills"] as const);
  readonly requiredSlices = Object.freeze(["skills"] as const);

  private available = false;
  private context: PluginContext | null = null;
  private previousHitpoints: number | null = null;
  private readonly beep: () => void;
  private readonly criticalBeep: () => void;

  constructor(
    beep: () => void = createToneBeeper({ frequency: 440, peakGain: HITPOINTS_ALERT_GAIN }),
    criticalBeep: () => void = createToneBeeper({ frequency: 440, peakGain: HITPOINTS_ALERT_GAIN * 1.25 }),
  ) {
    this.beep = beep;
    this.criticalBeep = criticalBeep;
  }

  mount(context: PluginContext): void {
    this.context = context;
  }

  onAvailability(available: boolean): void {
    this.available = available;
    if (!available) this.previousHitpoints = null;
  }

  onUpdate(update: ObserverUpdate): void {
    const snapshot = update.snapshot;
    const alertsEnabled = this.context?.settings.get().hitpointsAlerts ?? true;
    const hitpoints = snapshot?.ingame && this.available && alertsEnabled
      ? snapshot.skills?.[HITPOINTS_SKILL_ID]?.currentLevel ?? null
      : null;

    if (hitpoints === null || !Number.isFinite(hitpoints)) {
      this.previousHitpoints = null;
      return;
    }

    if (!update.clientChanged && this.previousHitpoints !== null) {
      if (this.previousHitpoints >= CRITICAL_HITPOINTS_THRESHOLD && hitpoints < CRITICAL_HITPOINTS_THRESHOLD) {
        this.criticalBeep();
      } else if (this.previousHitpoints >= LOW_HITPOINTS_THRESHOLD && hitpoints < LOW_HITPOINTS_THRESHOLD) {
        this.beep();
      }
    }
    this.previousHitpoints = hitpoints;
  }

  unmount(): void {
    this.previousHitpoints = null;
    this.context = null;
  }
}
