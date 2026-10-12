# Chord Lab

An interactive trainer for chords, circle-of-fifths transposition and (jazz/pop) voice leading,
played with a MIDI keyboard (built around the Arturia KeyStep 37), the mouse, or the computer keyboard.

## Run it

```bash
npm install
npm run dev        # then open the printed URL in Chrome or Edge
```

Other scripts: `npm test` (unit tests), `npm run typecheck`, `npm run build` (static site in `dist/`),
`npm run preview` (serve the build locally).

## Playing

- **MIDI:** Chrome and Edge support Web MIDI (Firefox asks for an extra permission; Safari has none).
  Allow the MIDI permission prompt. Devices can be plugged in before or after the page loads.
- **Sound:** browsers keep audio off until you click or press a key once. The KeyStep has no
  built-in sound, so the app plays every note itself, with a small Web Audio synth.
- **Sustain pedal:** a pedal plugged into the KeyStep (MIDI CC64) sustains the sound. Optionally
  (sidebar) pedalled notes also count as held for chord detection.
- **Computer keyboard:** the letters printed on the piano keys are the computer keys that play them
  (home row for white keys, the row above for black keys).
- **Octave:** the ◀ ▶ buttons beside the keyboard (or `Z` / `X`) move the keyboard and the computer
  keys by an octave. Playing outside the visible keys on a MIDI keyboard brings them into view.
- **Mouse:** with *latch* on (the default), clicking a key holds it until you click it again, so you
  can build chords one note at a time. `Esc` releases them all.

Whenever the app plays something for you (Hear, Show me, Play back) the keys light up, labelled
with each note and its role in the chord. Settings are saved per browser.

## Modes

**Free play.** Play anything and the app names the chord live: symbol, inversion, Roman numeral
in the current key (including secondary dominants like V7/ii and borrowed chords like ♭VII), and
each note's role (R, ♭3, 5, ♭7…). Chords you hold for a moment build a progression, which shows how
far your notes moved in total and how many stayed put, plus a breakdown of how each voice moved.

**Chord trainer.** You get a chord name and play it. Wrong notes turn red, with an explanation of
what's wrong. After each correct answer, it shows how far you moved from your previous chord
compared with the smoothest possible move. Chords you miss or play slowly come up more often (saved
between sessions). Options cover chord types, all 12 roots vs. only chords in the key, inversion
practice, and accepting 7th chords without the 5th.

**Circle of fifths.** An interactive circle (majors outside, relative minors inside) that shades the
chords of the current key and draws the progression as a path. Play the progression, and the app
moves you to the next key around the circle, down a 5th (C → F → B♭) or up (C → G → D), until
you've played it in all 12 keys. Your last chord carries into the next key, so the voice leading
continues across key changes. A results table tracks time and motion for each key. Click any wedge
to start there.

**Voice leading.** Play a progression in a chosen voicing style and see how each voice moves, as
sheet music or as a "voice lines" graph (green = held, blue = step, orange = leap, with the 3rds and
7ths highlighted). Styles:

- *Full chord*: any inversion, 5th optional.
- *Shells*: root, 3rd and 7th, root in the bass.
- *Guide tones*: just the 3rd and 7th.
- *Rootless A/B*: 3-5-7-9 or 7-9-3-5, with the 13th on dominants.

The score compares your total motion with the smoothest route from your first chord, and counts how
often the guide tones moved by step.

**Start inversion** (circle and voice leading). Choose how the first chord starts (root position or an
inversion; A or B form for rootless voicings) and the smoothest chain follows from it, e.g. for ii–V–I
in C: Dm7/F → G7/F → Cmaj7/E. With *Rotate*, each new key starts from the next inversion, so one lap of
the circle covers them all.

**Progressions** (circle and voice leading) include ii–V–I, minor ii–V–i, I–vi–ii–V, iii–vi–ii–V–I,
secondary dominants, the cycle of dominants (E7 → A7 → D7 → G7 → C), the backdoor ii–V, pop and
blues. **Custom** progressions can be typed as Roman numerals (`ii7 V7 Imaj7`, `♭VII7`, `V7/ii`) or
chord names (`Dm7 G7 Cmaj7`). Chord names are converted to numerals for the current key, so they
transpose like the rest.

**Sheet music.** Every mode shows chords on a grand staff (engraved with VexFlow), spelled for the
key. In the progression modes the bar you're on is highlighted, and the sheet follows along when the
app plays the progression. Toggle it in the sidebar.

## Restricting the notes

Both kinds of restriction live in the sidebar and apply to every mode:

- **Allowed notes:** a pitch-class set (any octave). Pick a scale preset on any tonic (major,
  minor, modes, pentatonics, whole tone, diminished…) or toggle individual notes. Forbidden keys
  are hatched.
- **Key window:** every chord must fit in a stretch of N keys (default 12, F3–E4), shown as the
  blue bar above the keyboard. In a 12-key window most chords fit only one way, so moving between
  them forces inversions. That's voice leading.

The trainer only asks for chords that can actually be played under the current restrictions. In the
progression modes, the app says which chord is ruled out and why (e.g. "Gm7 needs B♭, which isn't
in the allowed notes"), and *Skip chord* moves past it. The circle mode can move the allowed notes
along with each key change.

## Code layout

```
src/
  theory/          pure music theory, no DOM, unit-tested
    notes.ts         spelled notes (E♭ ≠ D♯), intervals, MIDI, pitch-class sets
    chords.ts        chord qualities, spelling, identification, chord-symbol parsing
    keys.ts          scales, key signatures, circle of fifths, Roman numerals
    progressions.ts  Roman numeral / chord-name parsing, built-in progressions
    constraint.ts    key window + allowed pitch classes
    voicing.ts       voicing enumeration, voice-leading distance, smoothest path through a progression
    target.ts        voicing styles, start inversions, answer checking
    staff.ts         key signatures and which accidentals to print
  audio/synth.ts   small Web Audio synth with sustain
  input/           MIDI (notes + sustain pedal), computer keyboard, and a merger of all inputs
  ui/              DOM helper, SVG keyboard, circle of fifths, voice graph, sheet music, settings sidebar
  modes/           Free play, Chord trainer, Circle of fifths, Voice leading, shared progression runner
  state.ts         settings, saved to localStorage
```

## Deploying

`npm run build` produces a fully static site in `dist/` that works from any sub-path (asset paths
are relative). The included GitHub Actions workflow (`.github/workflows/deploy.yml`) runs the tests,
builds, and publishes to GitHub Pages on every push to `master`. To enable it, set the repository's
*Settings → Pages → Source* to *GitHub Actions*.

## Ideas for later

- Timed play-along (a metronome and a bar per chord) for the circle and voice-leading modes.
- Two-handed voicings: shells in the left hand with guide-tone lines in the right.
- Saving several custom progressions, and per-progression history.
