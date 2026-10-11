const midiToFreq = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

interface Voice {
  oscillators: OscillatorNode[];
  amp: GainNode;
}

/** A small electric-piano-ish synth. The KeyStep has no sound of its own, so the app plays everything. */
export class Synth {
  muted = false;
  /** Called when the audio context starts or stops running. */
  onStateChange: () => void = () => {};
  private ctx: AudioContext | null = null;
  private out!: GainNode;
  private held = new Map<number, Voice>();

  /** Creates or resumes the audio context. Browsers only allow this after a click or key press. */
  unlock(): void {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.ctx.onstatechange = () => this.onStateChange();
      const limiter = this.ctx.createDynamicsCompressor();
      limiter.threshold.value = -12;
      limiter.ratio.value = 8;
      this.out = this.ctx.createGain();
      this.out.gain.value = 0.2;
      this.out.connect(limiter).connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  get running(): boolean {
    return this.ctx?.state === 'running';
  }

  noteOn(midi: number, velocity = 0.8): void {
    if (this.muted || !this.ctx) return;
    this.noteOff(midi);
    this.held.set(midi, this.startVoice(midi, velocity, this.ctx.currentTime));
  }

  noteOff(midi: number): void {
    const voice = this.held.get(midi);
    if (!voice || !this.ctx) return;
    this.held.delete(midi);
    const t = this.ctx.currentTime;
    voice.amp.gain.cancelScheduledValues(t);
    voice.amp.gain.setValueAtTime(voice.amp.gain.value, t);
    this.release(voice, t);
  }

  /** Plays notes as a lightly strummed chord, independent of whatever is being held. */
  playChord(notes: readonly number[], duration = 1.5, strum = 0.035): void {
    this.unlock();
    if (this.muted || !this.ctx) return;
    const start = this.ctx.currentTime + 0.02;
    [...notes]
      .sort((a, b) => a - b)
      .forEach((midi, i) => this.release(this.startVoice(midi, 0.7, start + i * strum), start + duration));
  }

  private startVoice(midi: number, velocity: number, t: number): Voice {
    const ctx = this.ctx!;
    const freq = midiToFreq(midi);
    const peak = 0.25 + 0.75 * velocity;

    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(peak, t + 0.006);
    amp.gain.setTargetAtTime(peak * 0.3, t + 0.006, 0.7);

    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.setValueAtTime(Math.min(freq * 10, 9000), t);
    tone.frequency.setTargetAtTime(Math.min(freq * 3, 4000), t, 0.4);

    const body = ctx.createOscillator();
    body.type = 'triangle';
    body.frequency.value = freq;

    const bell = ctx.createOscillator();
    bell.type = 'sine';
    bell.frequency.value = freq * 2;
    const bellAmp = ctx.createGain();
    bellAmp.gain.setValueAtTime(0.35, t);
    bellAmp.gain.setTargetAtTime(0.05, t, 0.25);

    body.connect(tone);
    bell.connect(bellAmp).connect(tone);
    tone.connect(amp).connect(this.out);
    body.start(t);
    bell.start(t);
    return { oscillators: [body, bell], amp };
  }

  private release(voice: Voice, t: number): void {
    voice.amp.gain.setTargetAtTime(0, t, 0.08);
    for (const osc of voice.oscillators) osc.stop(t + 0.8);
  }
}
