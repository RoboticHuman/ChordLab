# Chord Lab

An interactive trainer for chords, circle-of-fifths transposition and (jazz/pop) voice leading,
played with a MIDI keyboard (built around the Arturia KeyStep 37), the mouse, or the computer keyboard.

## Run it

```bash
npm install
npm run dev        # then open the printed URL in Chrome or Edge
```

- **MIDI:** Chrome and Edge support Web MIDI. Allow the MIDI permission prompt. Devices can be
  plugged in before or after the page loads.
- **Sound:** browsers keep audio off until you click or press a key once. The KeyStep has no
  built-in sound, so the app plays every note itself.
- **Computer keyboard:** `A W S E D F T G Y H U J K O L P ; '` play a piano layout starting at C4.
  `Z` / `X` shift the octave.
- **Mouse:** with *latch* on (the default), clicking a key holds it until you click it again, so you
  can build chords one note at a time. `Esc` releases them all.

Other scripts: `npm test` (theory unit tests), `npm run typecheck`, `npm run build`.

## Modes

**Free play.** Play anything and the app names the chord live: symbol, inversion, Roman numeral
in the current key (including secondary dominants like V7/ii and borrowed chords like ♭VII), and
each note's role (R, ♭3, 5, ♭7…). Chords you hold for a moment build a progression, which shows how
far your notes moved in total and how many stayed put. A breakdown shows how each voice moved
between the last two chords.

**Chord trainer.** You get a chord name and play it. Wrong notes turn red, with an explanation of
what's wrong. After each correct answer, it shows how far you moved from your previous chord
compared with the smoothest possible move. Chords you miss or play slowly come up more often (saved
between sessions). Options cover chord types, all 12 roots vs. only chords in the key, inversion
practice, and accepting 7th chords without the 5th.

## Restricting the notes

Both kinds of restriction live in the sidebar and apply to every mode:

- **Allowed notes:** a pitch-class set (any octave). Pick a scale preset on any tonic (major,
  minor, modes, pentatonics, whole tone, diminished…) or toggle individual notes. Forbidden keys
  are hatched.
- **Key window:** every chord must fit in a stretch of N keys (default 12, F3–E4), shown as the
  blue bar above the keyboard. In a 12-key window most chords fit only one way, so moving between
  them forces inversions. That's voice leading.

The trainer only asks for chords that can actually be played under the current restrictions.

## Code layout

```
src/
  theory/      pure music theory, no DOM, unit-tested
    notes.ts       spelled notes (E♭ ≠ D♯), intervals, MIDI, pitch-class sets
    chords.ts      chord qualities, spelling, identification, close voicings
    keys.ts        scales, key signatures, circle of fifths, Roman numerals
    constraint.ts  key window + allowed pitch classes
    voicing.ts     voicing enumeration, voice-leading distance, smoothest voicing
  audio/synth.ts   small Web Audio synth
  input/           MIDI, computer keyboard, and a merger of all inputs
  ui/              DOM helper, SVG keyboard, settings sidebar
  modes/           Free play, Chord trainer
  state.ts         settings, saved to localStorage
```

## Roadmap

- **Circle of fifths mode:** an interactive circle; play a progression (ii–V–I, I–vi–ii–V…), then
  repeat it in the next key around the circle; cycle-of-dominants drills (E7 → A7 → D7 → G7 → C).
- **Voice leading mode:** progressions scored on total motion and on guide-tone (3rd/7th) lines,
  with lines drawn between voices and A/B rootless voicings for ii–V–I.
- Sustain pedal, sheet-music view, and custom progressions.
