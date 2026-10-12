import { midiName, mod12 } from '../theory/notes';
import { voiceLeading } from '../theory/voicing';
import { s } from './dom';

export interface GraphNote {
  midi: number;
  /** Spelled name, e.g. "E♭". */
  name: string;
  /** Role in the chord, e.g. "♭7". */
  role: string;
  /** 3rd or 7th: the notes that carry the harmony. */
  guide: boolean;
}

export interface GraphColumn {
  label: string;
  sub?: string;
  notes: GraphNote[];
  /** A suggestion rather than something you played. */
  ghost?: boolean;
  current?: boolean;
}

const COL = 150;
const NOTE_W = 66;
const ROW = 15; // pixels per semitone
const LEFT = 40;
const TOP = 40;

/** A piano roll of voicings, with a line for every voice showing how far it moved to the next chord. */
export function voiceGraph(columns: readonly GraphColumn[]): SVGSVGElement {
  const all = columns.flatMap((c) => c.notes.map((n) => n.midi));
  const lo = (all.length ? Math.min(...all) : 55) - 2;
  const hi = (all.length ? Math.max(...all) : 67) + 2;
  const width = LEFT + Math.max(1, columns.length) * COL;
  const height = TOP + (hi - lo + 1) * ROW + 8;
  const y = (midi: number) => TOP + (hi - midi) * ROW;
  const x = (i: number) => LEFT + i * COL + (COL - NOTE_W) / 2 - 16;

  const svg = s('svg', { class: 'voice-graph', viewBox: `0 0 ${width} ${height}`, width, height });

  // Faint lines at each C, as on the keyboard.
  for (let m = lo; m <= hi; m++) {
    if (mod12(m) !== 0) continue;
    svg.append(
      s('line', { class: 'grid-c', x1: LEFT - 4, x2: width, y1: y(m) + ROW / 2, y2: y(m) + ROW / 2 }),
      s('text', { class: 'grid-label', x: 2, y: y(m) + ROW / 2 + 3 }, midiName(m)),
    );
  }

  // Voice lines between neighbouring chords.
  for (let i = 1; i < columns.length; i++) {
    const a = columns[i - 1];
    const b = columns[i];
    if (!a.notes.length || !b.notes.length) continue;
    const guideFrom = new Set(a.notes.filter((n) => n.guide).map((n) => n.midi));
    for (const m of voiceLeading(a.notes.map((n) => n.midi), b.notes.map((n) => n.midi)).motions) {
      const d = Math.abs(m.to - m.from);
      const kind = d === 0 ? 'held' : d <= 2 ? 'step' : 'leap';
      svg.appendChild(
        s('line', {
          class: `voice-line ${kind} ${guideFrom.has(m.from) ? 'guide' : ''} ${b.ghost ? 'ghost' : ''}`,
          x1: x(i - 1) + NOTE_W,
          y1: y(m.from) + ROW / 2,
          x2: x(i),
          y2: y(m.to) + ROW / 2,
        }),
      );
      if (d > 0) {
        svg.appendChild(
          s(
            'text',
            { class: `motion-label ${kind}`, x: (x(i - 1) + NOTE_W + x(i)) / 2, y: (y(m.from) + y(m.to)) / 2 + ROW / 2 - 3 },
            m.to > m.from ? `+${d}` : `−${d}`,
          ),
        );
      }
    }
  }

  columns.forEach((col, i) => {
    const g = s('g', { class: `graph-col ${col.ghost ? 'ghost' : ''} ${col.current ? 'current' : ''}` });
    g.appendChild(s('text', { class: 'graph-label', x: x(i) + NOTE_W / 2, y: 16 }, col.label));
    if (col.sub) g.appendChild(s('text', { class: 'graph-sub', x: x(i) + NOTE_W / 2, y: 31 }, col.sub));
    for (const n of col.notes) {
      g.append(
        s('rect', { class: `graph-note ${n.guide ? 'guide' : ''}`, x: x(i), y: y(n.midi), width: NOTE_W, height: ROW - 1, rx: 3 }),
        s('text', { class: 'graph-note-text', x: x(i) + 5, y: y(n.midi) + ROW - 4 }, n.name),
        s('text', { class: 'graph-note-role', x: x(i) + NOTE_W - 5, y: y(n.midi) + ROW - 4 }, n.role),
      );
    }
    svg.appendChild(g);
  });
  return svg;
}
