import { describe, expect, it } from 'vitest';
import { parseChordSymbol } from '../theory/chords';
import { UNCONSTRAINED } from '../theory/constraint';
import { parseMidi } from '../theory/notes';
import { fullTarget } from '../theory/target';
import { ProgressionRunner } from './progression';

const target = (s: string) => fullTarget(parseChordSymbol(s).chord, null, true);
const m = (...names: string[]) => names.map(parseMidi);
const range = { low: 48, high: 84 };
const feed = (r: ProgressionRunner, notes: number[]) => r.feed(notes, UNCONSTRAINED, range);

describe('ProgressionRunner', () => {
  it('keeps late-arriving notes with the chord just solved instead of judging them against the next', () => {
    const r = new ProgressionRunner([target('Dm7'), target('G7')]);
    expect(feed(r, m('D3', 'F3', 'C4')).solved).toBe(true); // a 7th chord counts without its 5th…
    expect(feed(r, m('D3', 'F3', 'A3', 'C4')).check).toBeNull(); // …so the A arriving next still belongs to Dm7
    expect(r.results[0].notes).toEqual(m('D3', 'F3', 'A3', 'C4'));
    expect(feed(r, m('D3', 'F3', 'G3', 'B3')).solved).toBe(true);
    expect(r.results[1].moved).toBe(3); // measured from the full Dm7 voicing
    expect(r.finished).toBe(true);
  });

  it('measures from the full chord even when fingers lift early on the way to the next', () => {
    const r = new ProgressionRunner([target('Dm7'), target('G7')]);
    feed(r, m('D3', 'F3', 'A3', 'C4'));
    feed(r, m('D3', 'F3', 'C4')); // A lifted first: still a Dm7 without its 5th
    feed(r, m('D3', 'F3'));
    feed(r, m('D3', 'F3', 'G3', 'B3'));
    expect(r.results[0].notes).toEqual(m('D3', 'F3', 'A3', 'C4'));
    expect(r.results[1].moved).toBe(3);
  });

  it('needs a fresh strike for a repeated chord', () => {
    const r = new ProgressionRunner([target('C'), target('C')]);
    expect(feed(r, m('C4', 'E4', 'G4')).solved).toBe(true);
    expect(feed(r, m('C4', 'E4', 'G4')).solved).toBe(false);
    feed(r, []);
    expect(feed(r, m('C4', 'E4', 'G4')).solved).toBe(true);
  });

  it('does not judge a carried-in chord against the new first chord', () => {
    const first = new ProgressionRunner([target('G7'), target('Cmaj7')]);
    feed(first, m('G3', 'B3', 'F4'));
    feed(first, m('E3', 'G3', 'B3'));
    feed(first, m('E3', 'G3', 'B3', 'C4'));
    expect(first.finished).toBe(true);
    const next = new ProgressionRunner([target('Gm7'), target('C7')], first.carry);
    expect(feed(next, m('E3', 'G3', 'B3', 'C4')).check).toBeNull();
    const { check } = feed(next, m('F3', 'G3', 'B♭3', 'D4'));
    expect(check?.correct).toBe(true);
    expect(next.results[0].moved).toBe(1 + 0 + 1 + 2);
  });
});
