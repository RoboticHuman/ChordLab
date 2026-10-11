import { ALL_PCS, type PcSet, type PitchClass, pcSet, pcSetHas } from './notes';

/** An inclusive range of MIDI notes, i.e. a stretch of physical keys. */
export interface KeyWindow {
  low: number;
  high: number;
}

/** Limits on which notes may be played. Both parts apply at once. */
export interface NoteConstraint {
  /** Keys the chord must stay within, or null for no limit. */
  window: KeyWindow | null;
  /** Pitch classes that may be used, in any octave. */
  allowed: PcSet;
}

export const UNCONSTRAINED: NoteConstraint = { window: null, allowed: ALL_PCS };

export function isNoteAllowed(midi: number, c: NoteConstraint): boolean {
  if (c.window && (midi < c.window.low || midi > c.window.high)) return false;
  return pcSetHas(c.allowed, midi);
}

export function disallowedNotes(notes: readonly number[], c: NoteConstraint): number[] {
  return notes.filter((n) => !isNoteAllowed(n, c));
}

export interface PcPreset {
  id: string;
  name: string;
  /** Semitones above the tonic. */
  steps: number[];
}

/** Ready-made sets of allowed notes, each built on a chosen tonic. */
export const PC_PRESETS: readonly PcPreset[] = [
  { id: 'major', name: 'Major scale', steps: [0, 2, 4, 5, 7, 9, 11] },
  { id: 'minor', name: 'Natural minor', steps: [0, 2, 3, 5, 7, 8, 10] },
  { id: 'harmonicMinor', name: 'Harmonic minor', steps: [0, 2, 3, 5, 7, 8, 11] },
  { id: 'melodicMinor', name: 'Melodic minor', steps: [0, 2, 3, 5, 7, 9, 11] },
  { id: 'dorian', name: 'Dorian', steps: [0, 2, 3, 5, 7, 9, 10] },
  { id: 'mixolydian', name: 'Mixolydian', steps: [0, 2, 4, 5, 7, 9, 10] },
  { id: 'majorPentatonic', name: 'Major pentatonic', steps: [0, 2, 4, 7, 9] },
  { id: 'minorPentatonic', name: 'Minor pentatonic', steps: [0, 3, 5, 7, 10] },
  { id: 'blues', name: 'Blues', steps: [0, 3, 5, 6, 7, 10] },
  { id: 'wholeTone', name: 'Whole tone', steps: [0, 2, 4, 6, 8, 10] },
  { id: 'diminished', name: 'Diminished (half-whole)', steps: [0, 1, 3, 4, 6, 7, 9, 10] },
];

export function presetPcSet(presetId: string, tonic: PitchClass): PcSet {
  const preset = PC_PRESETS.find((p) => p.id === presetId);
  if (!preset) return ALL_PCS;
  return pcSet(preset.steps.map((s) => tonic + s));
}
