import { describe, expect, it } from 'vitest';
import { NoteInput } from './noteInput';

function setup() {
  const input = new NoteInput();
  const log: string[] = [];
  input.noteOn.on((m) => log.push(`on ${m}`));
  input.noteOff.on((m) => log.push(`off ${m}`));
  return { input, log };
}

describe('NoteInput', () => {
  it('holds a note until every source lets go', () => {
    const { input, log } = setup();
    input.press(60, 'midi');
    input.press(60, 'mouse');
    input.release(60, 'midi');
    expect(input.held).toEqual([60]);
    input.release(60, 'mouse');
    expect(input.held).toEqual([]);
    expect(log).toEqual(['on 60', 'off 60']);
  });

  it('ignores releases from a source that was not holding the note', () => {
    const { input } = setup();
    input.press(60, 'midi');
    input.release(60, 'keys');
    expect(input.held).toEqual([60]);
  });

  it('keeps pedalled notes held only when pedalHolds is on', () => {
    const { input } = setup();
    input.setPedal(true);
    input.press(60, 'midi');
    input.release(60, 'midi');
    expect(input.held).toEqual([]);

    input.pedalHolds = true;
    input.press(64, 'midi');
    input.release(64, 'midi');
    input.release(67, 'midi'); // never pressed: must not appear
    expect(input.held).toEqual([64]);
    input.setPedal(false);
    expect(input.held).toEqual([]);
  });

  it('toggles latched notes', () => {
    const { input } = setup();
    input.toggle(60, 'mouse');
    input.toggle(64, 'mouse');
    input.toggle(60, 'mouse');
    expect(input.held).toEqual([64]);
    input.releaseAll('mouse');
    expect(input.held).toEqual([]);
  });
});
