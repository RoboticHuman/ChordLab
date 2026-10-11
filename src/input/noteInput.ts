export type NoteSource = 'midi' | 'mouse' | 'keys';

type Listener<A extends unknown[]> = (...args: A) => void;

class Emitter<A extends unknown[]> {
  private listeners = new Set<Listener<A>>();
  on(fn: Listener<A>): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  emit(...args: A): void {
    for (const fn of this.listeners) fn(...args);
  }
}

/** Merges MIDI, mouse and computer-keyboard input into one set of held notes. */
export class NoteInput {
  readonly noteOn = new Emitter<[midi: number, velocity: number]>();
  readonly noteOff = new Emitter<[midi: number]>();
  /** Fires with the sorted held notes whenever they change. */
  readonly changed = new Emitter<[held: number[]]>();

  private sources = new Map<number, Set<NoteSource>>();

  get held(): number[] {
    return [...this.sources.keys()].sort((a, b) => a - b);
  }

  press(midi: number, source: NoteSource, velocity = 0.8): void {
    const existing = this.sources.get(midi);
    if (existing) {
      existing.add(source);
      return;
    }
    this.sources.set(midi, new Set([source]));
    this.noteOn.emit(midi, velocity);
    this.changed.emit(this.held);
  }

  release(midi: number, source: NoteSource): void {
    const s = this.sources.get(midi);
    if (!s?.delete(source) || s.size) return;
    this.sources.delete(midi);
    this.noteOff.emit(midi);
    this.changed.emit(this.held);
  }

  isHeldBy(midi: number, source: NoteSource): boolean {
    return this.sources.get(midi)?.has(source) ?? false;
  }

  /** For latched mouse input: click once to hold, click again to let go. */
  toggle(midi: number, source: NoteSource): void {
    if (this.isHeldBy(midi, source)) this.release(midi, source);
    else this.press(midi, source);
  }

  releaseAll(source?: NoteSource): void {
    for (const [midi, s] of [...this.sources]) {
      for (const src of [...s]) if (!source || src === source) this.release(midi, src);
    }
  }
}
