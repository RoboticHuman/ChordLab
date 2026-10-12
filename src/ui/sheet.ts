import { keyFromSignature } from '../theory/keys';
import { LETTERS, type SpelledNote, octaveOf } from '../theory/notes';
import { printedAccidental } from '../theory/staff';
import { h } from './dom';

export interface SheetChord {
  notes: { midi: number; spelling: SpelledNote }[];
  /** Chord symbol written above the staff. */
  label?: string;
}

/** A rendered score whose bars can be highlighted without redrawing. */
export interface Sheet {
  el: HTMLElement;
  /** `current`: the bar you're on. `playing`: the bar the app is sounding right now. */
  highlight(current: number | null, playing: number | null): void;
}

type VF = typeof import('vexflow/bravura');

/** VexFlow and its music font load on first use, so the rest of the app starts quickly. */
let vexflow: Promise<VF> | null = null;
function loadVexFlow(): Promise<VF> {
  vexflow ??= import('vexflow/bravura').then(async (mod) => {
    await Promise.all([document.fonts.load('30px Bravura'), document.fonts.load('14px Academico')]);
    return mod;
  });
  return vexflow;
}

const INK = '#1d1d1f';
const ACCIDENTAL_CODE: Record<number, string> = { [-2]: 'bb', [-1]: 'b', 0: 'n', 1: '#', 2: '##' };
const SVG_NS = 'http://www.w3.org/2000/svg';

/** VexFlow key name for a signature, e.g. -3 → "Eb". Minor keys share their relative major's signature. */
function keySpec(sig: number): string {
  const tonic = keyFromSignature(Math.max(-7, Math.min(7, sig)), 'major').tonic;
  return LETTERS[tonic.letter] + (tonic.accidental > 0 ? '#' : tonic.accidental < 0 ? 'b' : '');
}

/** "eb/4" style pitch for VexFlow; the octave follows the spelling (B♯3 is written below middle C). */
function vfKey(midi: number, spelling: SpelledNote): string {
  return `${LETTERS[spelling.letter].toLowerCase()}/${octaveOf(midi, spelling)}`;
}

// VexFlow puts a staff's top line 40px below the y it is given, leaving room for ledger lines.
const TOP = 6; // treble staff y: its top line is at TOP + 40
const STAFF_GAP = 90; // treble staff y to bass staff y
const BASS_BOTTOM = TOP + STAFF_GAP + 80; // bottom line of the bass staff
const LABEL_Y = TOP + 16; // chord symbols, above the ledger-line room
const HEIGHT = BASS_BOTTOM + 28;
const MEASURE = 112;
const LEFT = 26; // room for the brace
const SCALE = 1.1;

/** Draws the score; returns each bar's horizontal extent so it can be highlighted. */
async function draw(host: HTMLDivElement, chords: readonly SheetChord[], sig: number): Promise<{ x: number; w: number }[]> {
  const { Accidental, Formatter, GhostNote, Renderer, Stave, StaveConnector, StaveNote, Voice } = await loadVexFlow();
  host.replaceChildren();
  const measures = chords.length ? chords : [{ notes: [] }];

  // Size the first bar to fit the clefs and key signature.
  const header = new Stave(0, 0, 400).addClef('treble').addKeySignature(keySpec(sig)).getNoteStartX();
  const width = LEFT + header + measures.length * MEASURE + 10;

  const renderer = new Renderer(host, Renderer.Backends.SVG);
  renderer.resize(width * SCALE, HEIGHT * SCALE);
  const ctx = renderer.getContext();
  ctx.scale(SCALE, SCALE);
  ctx.setFillStyle(INK);
  ctx.setStrokeStyle(INK);

  const bars: { x: number; w: number }[] = [];
  let x = LEFT;
  measures.forEach((chord, i) => {
    const first = i === 0;
    const last = i === measures.length - 1;
    const w = first ? header + MEASURE : MEASURE;
    const treble = new Stave(x, TOP, w);
    const bass = new Stave(x, TOP + STAFF_GAP, w);
    if (first) {
      treble.addClef('treble').addKeySignature(keySpec(sig));
      bass.addClef('bass').addKeySignature(keySpec(sig));
    }
    if (last) {
      treble.setEndBarType(3); // final double bar
      bass.setEndBarType(3);
    }
    treble.setContext(ctx).draw();
    bass.setContext(ctx).draw();
    if (first) {
      new StaveConnector(treble, bass).setType('brace').setContext(ctx).draw();
      new StaveConnector(treble, bass).setType('singleLeft').setContext(ctx).draw();
    }
    new StaveConnector(treble, bass).setType(last ? 'boldDoubleRight' : 'singleRight').setContext(ctx).draw();

    const staffNote = (clef: 'treble' | 'bass') => {
      const notes = chord.notes.filter((n) => (clef === 'treble' ? n.midi >= 60 : n.midi < 60)).sort((a, b) => a.midi - b.midi);
      if (!notes.length) {
        // A whole rest when the other staff has the chord; nothing at all for an empty bar.
        if (!chord.notes.length) return new GhostNote({ duration: 'w' });
        return new StaveNote({ keys: [clef === 'treble' ? 'b/4' : 'd/3'], duration: 'wr', clef });
      }
      const note = new StaveNote({ keys: notes.map((n) => vfKey(n.midi, n.spelling)), duration: 'w', clef });
      notes.forEach((n, index) => {
        const acc = printedAccidental(n.spelling, sig);
        if (acc !== null) note.addModifier(new Accidental(ACCIDENTAL_CODE[acc]), index);
      });
      return note;
    };
    const voices = (['treble', 'bass'] as const).map((clef) =>
      new Voice({ numBeats: 4, beatValue: 4 }).addTickables([staffNote(clef)]),
    );
    new Formatter().joinVoices([voices[0]]).joinVoices([voices[1]]).format(voices, w - (first ? header : 0) - 24);
    voices[0].draw(ctx, treble);
    voices[1].draw(ctx, bass);

    if (chord.label) {
      ctx.save();
      ctx.setFont('Academico', 14, 'normal');
      ctx.fillText(chord.label, treble.getNoteStartX() + 2, LABEL_Y);
      ctx.restore();
    }
    // Highlight only the music, not the clefs and key signature of the first bar.
    const start = first ? treble.getNoteStartX() - 8 : x;
    bars.push({ x: start, w: x + w - start });
    x += w;
  });
  return bars;
}

/** Sheet music: a grand staff with one whole-note chord per bar. Draws asynchronously the first time. */
export function sheetMusic(chords: readonly SheetChord[], sig: number): Sheet {
  const host = h('div', { class: 'sheet' });
  let rects: SVGRectElement[] = [];
  let state: [number | null, number | null] = [null, null];
  const apply = () =>
    rects.forEach((r, i) => {
      r.classList.toggle('current', i === state[0]);
      r.classList.toggle('playing', i === state[1]);
    });

  void draw(host, chords, sig).then((bars) => {
    const svg = host.querySelector('svg');
    if (!svg) return;
    // Highlight boxes sit behind the music.
    rects = bars.map(({ x, w }) => {
      const r = document.createElementNS(SVG_NS, 'rect');
      r.setAttribute('class', 'bar-highlight');
      r.setAttribute('x', String(x));
      r.setAttribute('y', String(TOP + 1));
      r.setAttribute('width', String(w));
      r.setAttribute('height', String(BASS_BOTTOM + 8 - TOP - 1));
      r.setAttribute('rx', '6');
      return r;
    });
    svg.prepend(...rects);
    apply();
  });

  return {
    el: host,
    highlight(current, playing) {
      state = [current, playing];
      apply();
    },
  };
}
