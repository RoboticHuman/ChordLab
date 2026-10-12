import type { Synth } from '../audio/synth';
import type { NoteInput } from '../input/noteInput';
import { type Settings, type Store, getConstraint, getKey, getRange } from '../state';
import { type Chord, type ChordMatch, bestRootSpelling, chordSymbol, identifyChord, toneLabel } from '../theory/chords';
import { type Key, scaleNotes, spellInKey } from '../theory/keys';
import {
  ALL_PCS,
  type Interval,
  type PcSet,
  type SpelledNote,
  midiName,
  mod12,
  noteName,
  pcOf,
  pcSetHas,
  transpose,
} from '../theory/notes';
import type { NoteConstraint } from '../theory/constraint';
import { type Target, type TargetCheck, requiredPcs, targetVoicings } from '../theory/target';
import { closestVoicing, smoothestPath } from '../theory/voicing';
import type { SheetChord } from '../ui/sheet';
import type { KeyMark, Keyboard } from '../ui/keyboard';

export interface AppContext {
  input: NoteInput;
  keyboard: Keyboard;
  synth: Synth;
  settings: Store<Settings>;
}

export interface Mode {
  mount(root: HTMLElement): void;
  unmount(): void;
}

export interface Range {
  low: number;
  high: number;
}

/** Spells an identified chord for the key: diatonic roots use the scale's spelling. */
export function spellMatch(match: ChordMatch, key: Key): Chord {
  const diatonic = scaleNotes(key).find((n) => pcOf(n) === match.rootPc);
  return { root: diatonic ?? bestRootSpelling(match.rootPc, match.quality), quality: match.quality };
}

/** The interval (chord tone or tension) a note plays in the chord, if any. */
function roleOf(midi: number, chord: Chord, tones: readonly Interval[]): Interval | undefined {
  const root = pcOf(chord.root);
  return tones.find((t) => mod12(root + t.semitones) === mod12(midi));
}

/** Spells each note as the chord tone it is (so G♯ in E major, A♭ in F minor), else as the key spells it. */
export function spellNotes(
  notes: readonly number[],
  chord: Chord | null,
  key: Key,
  tones: readonly Interval[] = chord?.quality.tones ?? [],
): SpelledNote[] {
  return notes.map((n) => {
    const role = chord && roleOf(n, chord, tones);
    return chord && role ? transpose(chord.root, role) : spellInKey(n, key);
  });
}

/** Key labels like "F\n♭3": the spelled note name, with its role in the chord on a second line. */
export function chordLabels(
  notes: readonly number[],
  chord: Chord | null,
  key: Key,
  tones: readonly Interval[] = chord?.quality.tones ?? [],
): Map<number, string> {
  const spelled = spellNotes(notes, chord, key, tones);
  return new Map(
    notes.map((n, i) => {
      const role = chord && roleOf(n, chord, tones);
      return [n, role ? `${noteName(spelled[i])}\n${toneLabel(role)}` : noteName(spelled[i])];
    }),
  );
}

/** A chord for the sheet-music view, spelled in context. */
export function sheetChord(notes: readonly number[], chord: Chord | null, key: Key, label?: string): SheetChord {
  const spelled = spellNotes(notes, chord, key, chord ? withTensions(chord) : []);
  return { notes: notes.map((midi, i) => ({ midi, spelling: spelled[i] })), label };
}

/** Chord tones plus the usual 9th, 11th and 13th, so tensions in rootless voicings spell correctly. */
export function withTensions(chord: Chord): Interval[] {
  return [...chord.quality.tones, { degree: 9, semitones: 14 }, { degree: 11, semitones: 17 }, { degree: 13, semitones: 21 }];
}

/**
 * Colours and labels the keyboard: `hints` (from Show me or suggestions) as targets named for
 * `hintChord`, and held notes as right or wrong per `verdict`, named for `heldChord`.
 */
export function paintKeys(
  keyboard: Keyboard,
  key: Key,
  held: { notes: readonly number[]; verdict: Map<number, boolean> | null; chord: Chord | null },
  hints: { notes: readonly number[]; chord: Chord | null },
): void {
  const marks = new Map<number, KeyMark>(hints.notes.map((n) => [n, 'target']));
  for (const n of held.notes) {
    const ok = held.verdict?.get(n);
    if (ok !== undefined) marks.set(n, ok ? 'ok' : 'bad');
  }
  const tones = (c: Chord | null) => (c ? withTensions(c) : []);
  const labels = chordLabels(held.notes, held.chord, key, tones(held.chord));
  for (const [n, label] of chordLabels(hints.notes, hints.chord, key, tones(hints.chord))) labels.set(n, label);
  keyboard.setMarks(marks);
  keyboard.setLabels(labels);
}

/** Spelled note name with octave, e.g. "E♭4", using the key's spelling. */
export const noteInKey = (midi: number, key: Key): string => midiName(midi, spellInKey(midi, key));

/** The keys chords may be voiced in: the window if one is set, otherwise the visible keyboard. */
export function playableRange(s: Settings): Range {
  return getConstraint(s).window ?? getRange(s);
}

/** A comfortable register for demonstrating chords when no window is set. */
export function demoRange(s: Settings): Range {
  const w = getConstraint(s).window;
  if (w) return w;
  const r = getRange(s);
  return { low: Math.max(r.low, 48), high: Math.min(r.high, 79) };
}

/** Widest hand stretch to suggest, in semitones. */
export const MAX_SPAN = 14;

/**
 * Voicings of a target to suggest: only allowed notes, within a hand span if possible, and complete
 * (with the optional 5th) wherever a complete voicing fits. Leaving the 5th out is fine to play, but
 * hints should show the whole chord.
 */
export function voicingOptions(target: Target, range: Range, allowed: PcSet = ALL_PCS): number[][] {
  const ok = (v: number[]) => v.every((n) => pcSetHas(allowed, n));
  const within = targetVoicings(target, range.low, range.high, MAX_SPAN).filter(ok);
  const options = within.length ? within : targetVoicings(target, range.low, range.high).filter(ok);
  const most = Math.max(0, ...options.map((v) => v.length));
  return options.filter((v) => v.length === most);
}

/**
 * Why some chord in `targets` can't be played under the current limits, or null if all can.
 * E.g. "Gm7 needs B♭, which isn't in the allowed notes".
 */
export function playabilityProblem(targets: readonly Target[], range: Range, allowed: PcSet, key: Key): string | null {
  for (const t of targets) {
    const name = chordSymbol(t.chord);
    const missing = requiredPcs(t).filter((pc) => !pcSetHas(allowed, pc));
    if (missing.length) {
      const names = spellNotes(missing, t.chord, key, withTensions(t.chord)).map(noteName).join(' and ');
      return `${name} needs ${names}, which ${missing.length > 1 ? 'aren’t' : 'isn’t'} in the allowed notes`;
    }
    if (!voicingOptions(t, range, allowed).length) return `${name} doesn’t fit in the key window`;
  }
  return null;
}

/** Explains a wrong answer, e.g. "That's C♯°/G: missing C; D♭ not in the chord." */
export function describeCheck(
  check: TargetCheck,
  target: Target,
  held: readonly number[],
  key: Key,
  constraint: NoteConstraint,
): string {
  const tone = (i: number) => noteName(transpose(target.chord.root, target.tones[i]));
  const fullChord = target.tones === target.chord.quality.tones;
  const problems: string[] = [];
  if (check.missing.length) problems.push(`missing ${check.missing.map(tone).join(', ')}`);
  if (check.extra.length) {
    const names = check.extra.map((pc) => noteName(spellInKey(pc, key))).join(', ');
    problems.push(`${names} ${fullChord ? 'not in the chord' : 'not part of this voicing'}`);
  }
  if (check.bassWrong) problems.push(`the lowest note should be ${target.bass.map(tone).join(' or ')}`);
  const forbidden = [
    ...new Set(check.outside.filter((n) => !pcSetHas(constraint.allowed, n)).map((n) => noteName(spellInKey(n, key)))),
  ];
  const outOfWindow = check.outside.filter((n) => pcSetHas(constraint.allowed, n)).map((n) => noteInKey(n, key));
  if (forbidden.length) problems.push(`${forbidden.join(', ')} ${forbidden.length > 1 ? 'aren’t' : 'isn’t'} in the allowed notes`);
  if (outOfWindow.length) problems.push(`${outOfWindow.join(', ')} ${outOfWindow.length > 1 ? 'are' : 'is'} outside the key window`);
  const [played] = identifyChord(held);
  const playedName = played ? `That's ${chordSymbol(spellMatch(played, key), played.inversion, played.no5)}: ` : '';
  return `${playedName}${problems.join('; ')}.`;
}

/**
 * A voicing to demonstrate: the smoothest move from `prev`, or (with no previous chord) a full,
 * compact voicing near the middle of the range.
 */
export function suggestVoicing(
  target: Target,
  prev: readonly number[],
  range: Range,
  allowed: PcSet = ALL_PCS,
): number[] | null {
  const options = voicingOptions(target, range, allowed);
  if (!options.length) return null;
  if (prev.length) return closestVoicing(options, prev);
  return smoothestPath([options], { center: (range.low + range.high) / 2 })!.path[0];
}

/** The smoothest way through a whole progression, optionally continuing from a voicing already played. */
export function suggestPath(
  targets: readonly Target[],
  range: Range,
  allowed: PcSet = ALL_PCS,
  start?: number[],
): number[][] | null {
  if (!targets.length) return [];
  const options = targets.map((t) => voicingOptions(t, range, allowed));
  if (start) {
    const result = smoothestPath([[start], ...options]);
    return result ? result.path.slice(1) : null;
  }
  return smoothestPath(options, { center: (range.low + range.high) / 2 })?.path ?? null;
}

/**
 * Suggested voicings for a run of chords: the smoothest route if every chord can be voiced, otherwise
 * the best chain through the ones that can, with an empty voicing for each one that can't.
 */
export function suggestRoute(
  targets: readonly Target[],
  range: Range,
  allowed: PcSet = ALL_PCS,
  start?: number[],
): number[][] {
  const path = suggestPath(targets, range, allowed, start);
  if (path) return path;
  let prev = start ?? [];
  return targets.map((t) => {
    const v = suggestVoicing(t, prev, range, allowed);
    if (v) prev = v;
    return v ?? [];
  });
}

/** Plays a chord for you and lights it up on the keyboard, each key labelled with its note and role. */
export function playAndShow(app: AppContext, notes: readonly number[], chord: Chord | null, seconds = 1.5): void {
  app.synth.playChord(notes, seconds);
  const key = getKey(app.settings.value);
  app.keyboard.flash(notes, seconds * 1000, chordLabels(notes, chord, key, chord ? withTensions(chord) : []));
}

export interface PlayStep {
  notes: number[];
  chord: Chord | null;
}

/**
 * Plays chords one after another, lighting up the keys. `onStep` gets the index of each chord as it
 * sounds, then null when the last one ends. Returns a function that cancels whatever hasn't played.
 */
export function playSequence(
  app: AppContext,
  steps: readonly PlayStep[],
  onStep: (index: number | null) => void = () => {},
  gapMs = 1000,
): () => void {
  const timers = steps.map((step, i) =>
    window.setTimeout(() => {
      onStep(i);
      playAndShow(app, step.notes, step.chord, gapMs / 1100);
    }, i * gapMs),
  );
  timers.push(window.setTimeout(() => onStep(null), steps.length * gapMs));
  return () => timers.forEach(clearTimeout);
}
