import type { PluginContext, SolanaPlugin } from "../plugin-manager";
import type { ObserverUpdate } from "../types";
import { createToneBeeper } from "../audio-alert";

const PRAYER_SKILL_ID = 5;
const LOW_PRAYER_THRESHOLD = 10;
const CRITICAL_PRAYER_THRESHOLD = 5;
const PRAYER_ALERT_GAIN = 0.055;

export class PrayerNotifierPlugin implements SolanaPlugin {
  readonly id = "prayer-notifier";
  readonly requiredCapabilities = Object.freeze(["skills"] as const);
  readonly requiredSlices = Object.freeze(["skills"] as const);

  private available = false;
  private context: PluginContext | null = null;
  private previousPrayer: number | null = null;
  private readonly beep: () => void;
  private readonly criticalBeep: () => void;

  constructor(
    beep: () => void = createToneBeeper({ frequency: 660, peakGain: PRAYER_ALERT_GAIN }),
    criticalBeep: () => void = createToneBeeper({ frequency: 660, peakGain: PRAYER_ALERT_GAIN * 1.25 }),
  ) {
    this.beep = beep;
    this.criticalBeep = criticalBeep;
  }

  mount(context: PluginContext): void {
    this.context = context;
  }

  onAvailability(available: boolean): void {
    this.available = available;
    if (!available) this.previousPrayer = null;
  }

  onUpdate(update: ObserverUpdate): void {
    const snapshot = update.snapshot;
    const alertsEnabled = this.context?.settings.get().prayerAlerts ?? true;
    const prayer = snapshot?.ingame && this.available && alertsEnabled
      ? snapshot.skills?.[PRAYER_SKILL_ID]?.currentLevel ?? null
      : null;

    if (prayer === null || !Number.isFinite(prayer)) {
      this.previousPrayer = null;
      return;
    }

    if (!update.clientChanged && this.previousPrayer !== null) {
      if (this.previousPrayer >= CRITICAL_PRAYER_THRESHOLD && prayer < CRITICAL_PRAYER_THRESHOLD) {
        this.criticalBeep();
      } else if (this.previousPrayer >= LOW_PRAYER_THRESHOLD && prayer < LOW_PRAYER_THRESHOLD) {
        this.beep();
      }
    }
    this.previousPrayer = prayer;
  }

  unmount(): void {
    this.previousPrayer = null;
    this.context = null;
  }
}
