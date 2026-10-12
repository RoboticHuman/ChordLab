import { type Settings, getKey, getProgression, parallelSignature } from '../state';
import type { NoteConstraint } from '../theory/constraint';
import { keyName } from '../theory/keys';
import { pcSetHas } from '../theory/notes';
import { PROGRESSIONS, parseProgression, progressionText } from '../theory/progressions';
import { chordPcs, chordSymbol, type Chord } from '../theory/chords';
import {
  type StartOption,
  type Target,
  type TargetCheck,
  checkTarget,
  startOptions,
  targetVoicings,
  withStart,
} from '../theory/target';
import { closestVoicing, voiceLeading } from '../theory/voicing';
import { h, render } from '../ui/dom';
import type { AppContext, Range } from './mode';

export interface StepResult {
  notes: number[];
  ms: number;
  /** Semitones moved from the previous chord, if there was one. */
  moved: number | null;
  /** The least motion that would have reached this chord. */
  smoothest: number | null;
}

/** Previous chord carried into a new runner (e.g. the last chord of the previous key). */
export interface Carry {
  notes: number[];
  target: Target;
}

/** Walks through a progression: each chord counts as soon as it is played right, then the next one is due. */
export class ProgressionRunner {
  index = 0;
  readonly results: StepResult[] = [];
  private stepStart = performance.now();
  private prev: number[];
  /** Voicing before the last solved chord, to re-measure its motion if more of its notes arrive. */
  private beforeLast: number[] = [];
  /**
   * The chord just solved. While the held notes still make that chord they belong to it, not the next
   * one: a MIDI chord arrives a note at a time, and a 7th chord already counts before its 5th lands.
   */
  private lingering: Target | null;

  constructor(
    readonly targets: readonly Target[],
    carry: Carry | null = null,
  ) {
    this.prev = carry?.notes ?? [];
    this.lingering = carry?.target ?? null;
  }

  get current(): Target | undefined {
    return this.targets[this.index];
  }

  get finished(): boolean {
    return this.index >= this.targets.length;
  }

  /** The voicing played most recently (possibly from before this runner started). */
  get previous(): number[] {
    return this.prev;
  }

  /** The chord to carry into a following runner. */
  get carry(): Carry | null {
    const last = this.targets[this.index - 1];
    return last && this.prev.length ? { notes: this.prev, target: last } : null;
  }

  feed(held: number[], constraint: NoteConstraint, range: Range): { check: TargetCheck | null; solved: boolean } {
    if (this.lingering) {
      if (held.length && checkTarget(held, this.lingering, constraint).correct) {
        this.amendLast(held, constraint, range);
        return { check: null, solved: false };
      }
      this.lingering = null;
    }
    const target = this.current;
    if (!target) return { check: null, solved: false };
    const check = checkTarget(held, target, constraint);
    if (!check.correct) return { check, solved: false };

    const now = performance.now();
    this.results.push({ notes: held, ms: now - this.stepStart, ...this.measure(this.prev, held, target, constraint, range) });
    this.beforeLast = this.prev;
    this.prev = held;
    this.index++;
    this.stepStart = now;
    this.lingering = target;
    return { check, solved: true };
  }

  /** Moves past the current chord without playing it (e.g. when the limits make it impossible). */
  skip(): void {
    if (!this.current) return;
    const now = performance.now();
    this.results.push({ notes: [], ms: now - this.stepStart, moved: null, smoothest: null });
    this.index++;
    this.stepStart = now;
    this.lingering = null;
  }

  /** More notes of the chord just solved arrived: keep the fuller voicing. (Lifting fingers on the way to the next chord changes nothing.) */
  private amendLast(held: number[], constraint: NoteConstraint, range: Range): void {
    if (!this.prev.every((n) => held.includes(n))) return;
    this.prev = held;
    const last = this.results[this.results.length - 1];
    if (!last || this.index === 0) return; // carried in from before this runner
    last.notes = held;
    Object.assign(last, this.measure(this.beforeLast, held, this.targets[this.index - 1], constraint, range));
  }

  private measure(
    from: number[],
    to: number[],
    target: Target,
    constraint: NoteConstraint,
    range: Range,
  ): { moved: number | null; smoothest: number | null } {
    if (!from.length) return { moved: null, smoothest: null };
    const moved = voiceLeading(from, to).distance;
    const options = targetVoicings(target, range.low, range.high).filter((v) => v.every((n) => pcSetHas(constraint.allowed, n)));
    const best = closestVoicing(options, from);
    return { moved, smoothest: best ? Math.min(moved, voiceLeading(from, best).distance) : moved };
  }
}

/** Progression dropdown plus a box for typing your own. Shared by the circle and voice-leading modes. */
export function progressionPicker(app: AppContext): { el: HTMLElement; sync: () => void } {
  const store = app.settings;
  const note = h('div', { class: 'muted picker-note' });
  const select = h(
    'select',
    {
      onchange: () => {
        const s = store.value;
        const def = PROGRESSIONS.find((p) => p.id === select.value);
        const mode = def?.mode ?? s.customMode;
        store.update({
          progressionId: select.value,
          keyMode: mode,
          keySig: parallelSignature(s.keySig, s.keyMode, mode),
        });
      },
    },
    PROGRESSIONS.map((p) => h('option', { value: p.id }, `${p.name}${p.mode === 'minor' ? ' (minor)' : ''}`)),
    h('option', { value: 'custom' }, 'Custom…'),
  );
  const input = h('input', {
    type: 'text',
    class: 'custom-progression',
    placeholder: 'e.g. ii7 V7 Imaj7  or  Dm7 G7 Cmaj7',
    onkeydown: (e: KeyboardEvent) => e.key === 'Enter' && save(),
  });
  const customRow = h('div', { class: 'row' }, input, h('button', { class: 'small', onclick: () => save() }, 'Use'));

  function save(): void {
    const s = store.value;
    const key = getKey(s);
    try {
      const steps = parseProgression(input.value, key);
      store.update({ progressionId: 'custom', customProgression: progressionText(steps, key), customMode: key.mode });
      input.blur();
    } catch (e) {
      note.textContent = (e as Error).message;
      note.classList.add('error');
    }
  }

  function sync(): void {
    const s: Settings = store.value;
    select.value = s.progressionId;
    customRow.style.display = s.progressionId === 'custom' ? '' : 'none';
    if (document.activeElement !== input) input.value = s.customProgression;
    const p = getProgression(s);
    const key = getKey(s);
    note.classList.toggle('error', !!p.error);
    note.textContent = p.error ?? (p.mode !== key.mode ? `Written for ${p.mode} keys, played here in ${keyName(key)}.` : '');
  }

  const el = h(
    'div',
    { class: 'progression-picker' },
    h('label', { class: 'row' }, h('span', { class: 'muted' }, 'Progression'), select),
    customRow,
    note,
  );
  sync();
  return { el, sync };
}

/** What to show for each chord: the voicing you played, or the suggestion for chords still to come. */
export function displayVoicings(runner: ProgressionRunner, continuation: readonly number[][]): number[][] {
  return runner.targets.map((_, i) => {
    if (i < runner.index) return runner.results[i]?.notes ?? [];
    return continuation[i - runner.index] ?? [];
  });
}

/** The progression with its first chord fixed to the chosen start option (-1: any). */
export function applyStart(targets: readonly Target[], startFrom: number): Target[] {
  const options = targets.length ? startOptions(targets[0]) : [];
  if (startFrom < 0 || !options.length) return [...targets];
  return [withStart(targets[0], options[startFrom % options.length]), ...targets.slice(1)];
}

/** The start option for the next key: the next one along when rotating, otherwise unchanged. */
export function nextStart(targets: readonly Target[], s: Settings): number {
  const count = targets.length ? startOptions(targets[0]).length : 0;
  return s.rotateStart && count ? (Math.max(s.startFrom, -1) + 1) % count : s.startFrom;
}

/** Symbol for a voicing as played: "G7/F" when a chord tone other than the root is lowest. */
export function playedSymbol(notes: readonly number[], chord: Chord): string {
  const bass = notes.length ? chordPcs(chord).indexOf(Math.min(...notes) % 12) : -1;
  return chordSymbol(chord, bass > 0 ? bass : 0);
}

/** "Start from" dropdown and "Rotate each key" checkbox for the first chord of a progression. */
export function startPicker(app: AppContext): { el: HTMLElement; sync: (options: readonly StartOption[]) => void } {
  const store = app.settings;
  const select = h('select', { onchange: () => store.update({ startFrom: Number(select.value) }) });
  const rotate = h('input', {
    type: 'checkbox',
    onchange: () => {
      const s = store.value;
      store.update({ rotateStart: rotate.checked, startFrom: rotate.checked && s.startFrom < 0 ? 0 : s.startFrom });
    },
  });
  const el = h(
    'div',
    { class: 'row' },
    h('label', { class: 'row', title: 'How the first chord starts: which note is lowest' }, h('span', { class: 'muted' }, 'Start'), select),
    h('label', { class: 'check', title: 'Each new key starts from the next inversion' }, rotate, 'Rotate'),
  );
  const sync = (options: readonly StartOption[]) => {
    const s = store.value;
    render(select, h('option', { value: -1 }, 'Any'), options.map((o, i) => h('option', { value: i }, o.label)));
    select.value = String(options.length && s.startFrom >= 0 ? s.startFrom % options.length : -1);
    select.disabled = rotate.disabled = !options.length;
    rotate.checked = s.rotateStart && options.length > 0;
    el.title = options.length ? '' : 'Shells always have the root at the bottom.';
  };
  return { el, sync };
}
