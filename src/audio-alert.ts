type AudioContextConstructor = new () => AudioContext;

export interface BeepOptions {
  readonly frequency: number;
  readonly peakGain: number;
  readonly durationSeconds?: number;
}

function getAudioContextConstructor(): AudioContextConstructor | null {
  const audioWindow = window as Window & { webkitAudioContext?: AudioContextConstructor };
  return window.AudioContext ?? audioWindow.webkitAudioContext ?? null;
}

export function createToneBeeper(options: BeepOptions): () => void {
  let context: AudioContext | null = null;
  const duration = options.durationSeconds ?? 0.15;

  const sound = (): void => {
    if (!context || context.state === "closed") return;
    const start = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "square";
    oscillator.frequency.setValueAtTime(options.frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(options.peakGain, start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration - 0.01);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + duration);
  };

  return (): void => {
    try {
      const AudioContextClass = getAudioContextConstructor();
      if (!AudioContextClass) return;
      context ??= new AudioContextClass();
      if (context.state === "suspended") {
        void context.resume().then(sound).catch(() => undefined);
      } else {
        sound();
      }
    } catch {
      // Audio can be unavailable under browser autoplay or device policies.
    }
  };
}
