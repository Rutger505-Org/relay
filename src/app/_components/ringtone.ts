/**
 * Synthesised ringtone for incoming calls. Uses the Web Audio API so we don't
 * ship a binary audio asset. Plays a classic two-tone "ring … ring …" pattern
 * on a loop until stopped.
 *
 * Browsers require a user gesture before audio can start. Incoming calls arrive
 * unsolicited, so playback may be blocked until the user has interacted with
 * the page at least once; we swallow that failure rather than throwing.
 */
export class Ringtone {
  private ctx: AudioContext | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  start(): void {
    if (this.timer) return; // already ringing
    try {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      void this.ctx.resume();
      this.ringOnce();
      // Repeat the ring cadence every 3s, like a phone.
      this.timer = setInterval(() => this.ringOnce(), 3000);
    } catch {
      // Audio unavailable / blocked — fail silently.
    }
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
  }

  /** A single "brrring" made of two short tones. */
  private ringOnce(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    // Two pulses, ~0.4s each, classic ring frequency around 440/480 Hz.
    this.pulse(now, 440);
    this.pulse(now + 0.5, 480);
  }

  private pulse(at: number, freq: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    // Soft attack/decay so it doesn't click.
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(0.25, at + 0.05);
    gain.gain.setValueAtTime(0.25, at + 0.35);
    gain.gain.linearRampToValueAtTime(0, at + 0.4);
    osc.connect(gain).connect(ctx.destination);
    osc.start(at);
    osc.stop(at + 0.45);
  }
}

/** Ask for browser notification permission (no-op if already decided). */
export function ensureNotificationPermission(): void {
  if (typeof Notification === "undefined") return;
  if (Notification.permission === "default") {
    void Notification.requestPermission();
  }
}

/**
 * Show a desktop notification for an incoming call. Returns the Notification so
 * the caller can close it when the call is answered/cancelled. Clicking it
 * focuses the tab.
 */
export function showIncomingCallNotification(handle: string): Notification | null {
  if (typeof Notification === "undefined") return null;
  if (Notification.permission !== "granted") return null;
  try {
    const n = new Notification("Incoming call", {
      body: `@${handle} is calling…`,
      tag: "relay-incoming-call",
      requireInteraction: true,
    });
    n.onclick = () => {
      window.focus();
      n.close();
    };
    return n;
  } catch {
    return null;
  }
}
