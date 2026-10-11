import type { Synth } from '../audio/synth';
import type { NoteInput } from '../input/noteInput';
import { type Settings, type Store, getConstraint, getRange } from '../state';
import { type Chord, type ChordMatch, bestRootSpelling, chordPcs, chordTones, toneLabel } from '../theory/chords';
import { type Key, scaleNotes, spellInKey } from '../theory/keys';
import { midiName, mod12, noteName, pcOf } from '../theory/notes';
import type { Keyboard } from '../ui/keyboard';

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

/** Spells an identified chord for the key: diatonic roots use the scale's spelling. */
export function spellMatch(match: ChordMatch, key: Key): Chord {
  const diatonic = scaleNotes(key).find((n) => pcOf(n) === match.rootPc);
  return { root: diatonic ?? bestRootSpelling(match.rootPc, match.quality), quality: match.quality };
}

/** Key labels like "F\n♭3": the spelled note name, with its role in the chord on a second line. */
export function chordLabels(notes: readonly number[], chord: Chord | null, key: Key): Map<number, string> {
  const labels = new Map<number, string>();
  const pcs = chord ? chordPcs(chord) : [];
  const tones = chord ? chordTones(chord) : [];
  for (const n of notes) {
    const i = pcs.indexOf(mod12(n));
    labels.set(n, i >= 0 ? `${noteName(tones[i])}\n${toneLabel(chord!.quality.tones[i])}` : noteName(spellInKey(n, key)));
  }
  return labels;
}

/** Spelled note name with octave, e.g. "E♭4", using the key's spelling. */
export const noteInKey = (midi: number, key: Key): string => midiName(midi, spellInKey(midi, key));

/** The keys chords may be voiced in: the window if one is set, otherwise the visible keyboard. */
export function playableRange(s: Settings): { low: number; high: number } {
  return getConstraint(s).window ?? getRange(s);
}

/** A comfortable register for demonstrating chords when no window is set. */
export function demoRange(s: Settings): { low: number; high: number } {
  const w = getConstraint(s).window;
  if (w) return w;
  const r = getRange(s);
  return { low: Math.max(r.low, 48), high: Math.min(r.high, 79) };
}
