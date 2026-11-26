/**
 * Realistic Web Audio foley synthesizer for wooden plank impacts, ivory/ebony die clacks, and chimes.
 */
export class SoundFxService {
  private muted: boolean = false;
  private ctx: AudioContext | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  public isMuted(): boolean {
    return this.muted;
  }

  public toggleMute(): boolean {
    this.muted = !this.muted;
    return this.muted;
  }

  private getContext(): AudioContext | null {
    if (this.muted || typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    if (this.ctx && !this.noiseBuffer) {
      const len = Math.floor(this.ctx.sampleRate * 0.35);
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      this.noiseBuffer = buf;
    }
    return this.ctx;
  }

  private triggerWoodTap(ctx: AudioContext, when: number, volume: number, pitchHz: number): void {
    // 1. Sharp hardwood-on-die transient crack (filtered noise impulse)
    if (this.noiseBuffer) {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;

      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(1650, when);
      bp.Q.setValueAtTime(1.9, when);

      const nGain = ctx.createGain();
      nGain.gain.setValueAtTime(0.001, when);
      nGain.gain.linearRampToValueAtTime(volume * 0.95, when + 0.002);
      nGain.gain.exponentialRampToValueAtTime(0.001, when + 0.032);

      src.connect(bp);
      bp.connect(nGain);
      nGain.connect(ctx.destination);
      src.start(when);
      src.stop(when + 0.038);
    }

    // 2. Hollow wooden box / plank cavity thud
    const bodyOsc = ctx.createOscillator();
    const bodyGain = ctx.createGain();
    bodyOsc.type = 'triangle';
    bodyOsc.frequency.setValueAtTime(pitchHz, when);
    bodyOsc.frequency.exponentialRampToValueAtTime(Math.max(48, pitchHz * 0.42), when + 0.085);

    bodyGain.gain.setValueAtTime(0.001, when);
    bodyGain.gain.linearRampToValueAtTime(volume * 0.8, when + 0.003);
    bodyGain.gain.exponentialRampToValueAtTime(0.001, when + 0.11);

    bodyOsc.connect(bodyGain);
    bodyGain.connect(ctx.destination);
    bodyOsc.start(when);
    bodyOsc.stop(when + 0.12);
  }

  public playRollClick(): void {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Subtle hand toss whoosh + palm catch tap
    if (this.noiseBuffer) {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(620, now);
      filter.frequency.exponentialRampToValueAtTime(1250, now + 0.08);
      filter.Q.setValueAtTime(1.2, now);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.06, now + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);

      src.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      src.start(now);
      src.stop(now + 0.12);
    }
  }

  public playPlankStrike(): void {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Heavy main strike plank impact: deep timber thud + sharp die crack + low-mid wood shudder
    this.triggerWoodTap(ctx, now, 0.34, 152);

    const lowPlank = ctx.createOscillator();
    const lowGain = ctx.createGain();
    lowPlank.type = 'sine';
    lowPlank.frequency.setValueAtTime(118, now);
    lowPlank.frequency.exponentialRampToValueAtTime(46, now + 0.16);
    lowGain.gain.setValueAtTime(0.001, now);
    lowGain.gain.linearRampToValueAtTime(0.28, now + 0.004);
    lowGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    lowPlank.connect(lowGain);
    lowGain.connect(ctx.destination);
    lowPlank.start(now);
    lowPlank.stop(now + 0.19);

    if (this.noiseBuffer) {
      const thudNoise = ctx.createBufferSource();
      thudNoise.buffer = this.noiseBuffer;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(440, now);
      lp.frequency.exponentialRampToValueAtTime(120, now + 0.12);

      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.22, now);
      ng.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

      thudNoise.connect(lp);
      lp.connect(ng);
      ng.connect(ctx.destination);
      thudNoise.start(now);
      thudNoise.stop(now + 0.15);
    }

    // Natural pit floor rebound taps as die bounces back into wooden box
    this.triggerWoodTap(ctx, now + 0.18, 0.14, 240);
    this.triggerWoodTap(ctx, now + 0.31, 0.08, 310);
  }

  public playSpinTick(): void {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    // Crisp wooden clack & settle tick inside pit
    this.triggerWoodTap(ctx, now, 0.12, 340);
    this.triggerWoodTap(ctx, now + 0.075, 0.06, 410);
  }

  public unlock(): void {
    if (this.muted || typeof window === 'undefined') return;
    this.getContext();
  }

  private playTonePulse(
    ctx: AudioContext,
    when: number,
    freqHz: number,
    durationSec: number,
    volume: number,
    waveType: OscillatorType = 'triangle',
    endFreqHz?: number
  ): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = waveType;
    osc.frequency.setValueAtTime(freqHz, when);
    if (endFreqHz && endFreqHz !== freqHz) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(40, endFreqHz), when + durationSec);
    }

    gain.gain.setValueAtTime(0.001, when);
    gain.gain.linearRampToValueAtTime(volume, when + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.001, when + durationSec);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(when);
    osc.stop(when + durationSec + 0.015);
  }

  /**
   * Escalating pre-roll / lobby countdown tick:
   * - >10s: steady, warm wooden clock tick-tock
   * - 6–10s: rising pitch + off-beat pulse signaling players to wrap up
   * - 1–5s: urgent double/triple hurry-up pulse with ascending pitch & low tension thump
   */
  public playCountdownTick(secondsRemaining: number, mode: 'roll' | 'lobby' = 'roll'): void {
    const ctx = this.getContext();
    if (!ctx || secondsRemaining <= 0) return;
    const now = ctx.currentTime;
    const baseGain = mode === 'roll' ? 1 : 0.82;

    if (secondsRemaining > 10) {
      // Steady rhythmic clock tick (alternating subtle pitch each second)
      const isEven = secondsRemaining % 2 === 0;
      this.triggerWoodTap(ctx, now, 0.042 * baseGain, isEven ? 520 : 460);
      this.playTonePulse(ctx, now, isEven ? 620 : 540, 0.045, 0.022 * baseGain, 'sine');
      return;
    }

    if (secondsRemaining > 5) {
      // 10s -> 6s: Alert stage — rising pitch + subtle off-beat anticipation tick
      const step = 10 - secondsRemaining; // 0..4
      const primaryHz = 680 + step * 38;
      this.triggerWoodTap(ctx, now, 0.068 * baseGain, 560 + step * 25);
      this.playTonePulse(ctx, now, primaryHz, 0.075, 0.055 * baseGain, 'triangle');
      // Soft mid-second ghost tick to feel the tempo speeding up
      this.triggerWoodTap(ctx, now + 0.28, 0.032 * baseGain, 640 + step * 20);
      this.playTonePulse(ctx, now + 0.28, primaryHz * 1.12, 0.045, 0.025 * baseGain, 'sine');
      return;
    }

    // 5s -> 1s: Urgent hurry-up stage! Fast ascending multi-pulse + tension thump
    const urgencyStep = 5 - secondsRemaining; // 0..4 (1s is 4)
    const urgentNotes = [880, 960, 1046.5, 1174.66, 1318.51];
    const baseHz = urgentNotes[Math.min(4, Math.max(0, urgencyStep))];

    // Low heartbeat / tension drum thump on the downbeat
    this.playTonePulse(ctx, now, 135 + urgencyStep * 10, 0.11, (0.1 + urgencyStep * 0.015) * baseGain, 'sine', 58);

    // Primary sharp urgent chirp
    this.triggerWoodTap(ctx, now, (0.09 + urgencyStep * 0.012) * baseGain, 700 + urgencyStep * 45);
    this.playTonePulse(ctx, now, baseHz, 0.085, (0.085 + urgencyStep * 0.012) * baseGain, 'triangle', baseHz * 1.06);

    if (secondsRemaining <= 3) {
      // Final 3..2..1s: rapid triple-beat urgency pulse
      this.playTonePulse(ctx, now + 0.145, baseHz * 1.18, 0.07, 0.068 * baseGain, 'triangle');
      this.triggerWoodTap(ctx, now + 0.145, 0.055 * baseGain, 840);

      this.playTonePulse(ctx, now + 0.29, baseHz * 1.32, 0.075, 0.075 * baseGain, 'sine');
      this.triggerWoodTap(ctx, now + 0.29, 0.06 * baseGain, 920);
    } else {
      // 5s & 4s: crisp double-beat hurry cue
      this.playTonePulse(ctx, now + 0.175, baseHz * 1.2, 0.075, 0.062 * baseGain, 'triangle');
      this.triggerWoodTap(ctx, now + 0.175, 0.05 * baseGain, 780);
    }
  }

  /**
   * Plays when countdown hits 0 and locks bets for the dice throw (or starts match).
   */
  public playCountdownComplete(mode: 'roll' | 'lobby' = 'roll'): void {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    if (mode === 'roll') {
      this.triggerWoodTap(ctx, now, 0.15, 220);
      this.playTonePulse(ctx, now, 783.99, 0.12, 0.09, 'triangle');
      this.playTonePulse(ctx, now + 0.085, 1046.5, 0.24, 0.11, 'sine');
    } else {
      this.triggerWoodTap(ctx, now, 0.11, 260);
      this.playTonePulse(ctx, now, 587.33, 0.1, 0.065, 'triangle');
      this.playTonePulse(ctx, now + 0.08, 783.99, 0.2, 0.075, 'sine');
    }
  }

  public playWinChime(): void {
    const ctx = this.getContext();
    if (!ctx) return;
    const notes = [523.25, 659.25, 783.99];
    notes.forEach((freq, idx) => {
      const now = ctx.currentTime + idx * 0.07;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.24);
    });
  }
}

export const soundFx = new SoundFxService();
