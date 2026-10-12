import { isTyping } from '../input/computerKeys';
import { type Settings, getConstraint, getKey, getProgression, keyChange, wrapSignature } from '../state';
import { type Chord, chordSymbol, toneLabel } from '../theory/chords';
import { type Key, romanNumeral } from '../theory/keys';
import { mod12, noteName, pcOf } from '../theory/notes';
import { realizeProgression } from '../theory/progressions';
import {
  type Target,
  VOICING_STYLES,
  type VoicingStyle,
  checkTarget,
  guideToneMotion,
  isGuideTone,
  startOptions,
  styleTarget,
  voicingForm,
} from '../theory/target';
import { voiceLeading } from '../theory/voicing';
import { h, render } from '../ui/dom';
import { type Sheet, sheetMusic } from '../ui/sheet';
import { type GraphColumn, type GraphNote, voiceGraph } from '../ui/voiceGraph';
import {
  type AppContext,
  type Mode,
  chordLabels,
  demoRange,
  describeCheck,
  paintKeys,
  playAndShow,
  playSequence,
  playabilityProblem,
  playableRange,
  sheetChord,
  spellNotes,
  suggestPath,
  suggestRoute,
  suggestVoicing,
  withTensions,
} from './mode';
import {
  ProgressionRunner,
  applyStart,
  displayVoicings,
  nextStart,
  playedSymbol,
  progressionPicker,
  startPicker,
} from './progression';

const totalMotion = (path: readonly number[][]) =>
  path.slice(1).reduce((sum, v, i) => sum + voiceLeading(path[i], v).distance, 0);

/** Play a progression in a chosen voicing style and see exactly how each voice moves. */
export class VoiceLeadingMode implements Mode {
  private cleanup: (() => void)[] = [];
  private picker!: ReturnType<typeof progressionPicker>;
  private start!: ReturnType<typeof startPicker>;
  /** The progression's chords in the chosen style, before the start inversion is applied. */
  private baseTargets: Target[] = [];
  private runner: ProgressionRunner | null = null;
  private chords: Chord[] = [];
  private targets: Target[] = [];
  /** The smoothest route through the whole progression, for comparison and for "Hear". */
  private bestPath: number[][] | null = null;
  private source = '';
  /** Notes shown by "Show me". */
  private revealed: number[] = [];
  /** The next chord's suggested voicing, marked on the keyboard when "light up" is on. */
  private suggested: number[] = [];
  /** The latest verdict on the held notes, and the chord they were judged against. */
  private heldVerdict: Map<number, boolean> | null = null;
  private heldChord: Chord | null = null;
  /** "Hear the smoothest way": the voicings being played and the chord sounding now. */
  private playback: { path: number[][]; index: number | null } | null = null;
  private cancelPlayback = () => {};
  private sheet: Sheet | null = null;
  private badTimer = 0;

  private styleSelect = h(
    'select',
    { onchange: () => this.app.settings.update({ voiceStyle: this.styleSelect.value as VoicingStyle }) },
    VOICING_STYLES.map((st) => h('option', { value: st.id }, st.name)),
  );
  private styleNote = h('p', { class: 'muted' });
  private chordsEl = h('div', { class: 'progression-row' });
  private feedbackEl = h('div', { class: 'feedback' });
  /** Lasting problems with the exercise itself, kept apart from feedback on what you play. */
  private warningEl = h('div', { class: 'warning' });
  private scoreEl = h('div', { class: 'score' });
  private viewHost = h('div', { class: 'view-host' });
  private legendEl = h(
    'div',
    { class: 'legend muted' },
    h('span', { class: 'swatch held' }),
    'held',
    h('span', { class: 'swatch step' }),
    'step (1–2 semitones)',
    h('span', { class: 'swatch leap' }),
    'leap',
    h('span', { class: 'swatch guide' }),
    '3rds and 7ths',
    h('span', { class: 'swatch ghost' }),
    'suggested',
  );
  private tabs = {
    sheet: h('button', { class: 'tab', onclick: () => this.app.settings.update({ voiceView: 'sheet' }) }, 'Sheet music'),
    lines: h('button', { class: 'tab', onclick: () => this.app.settings.update({ voiceView: 'lines' }) }, 'Voice lines'),
  };
  private lightNextEl = h('input', {
    type: 'checkbox',
    onchange: () => this.app.settings.update({ lightNext: this.lightNextEl.checked }),
  });

  constructor(private app: AppContext) {}

  mount(root: HTMLElement): void {
    this.picker = progressionPicker(this.app);
    this.start = startPicker(this.app);
    render(
      root,
      h(
        'div',
        { class: 'mode-grid' },
        h(
          'div',
          { class: 'col' },
          h(
            'div',
            { class: 'card' },
            h(
              'div',
              { class: 'options-bar' },
              h(
                'div',
                { class: 'row' },
                this.picker.el,
                h('label', { class: 'row' }, h('span', { class: 'muted' }, 'Voicing'), this.styleSelect),
              ),
              this.styleNote,
              this.start.el,
              h('label', { class: 'check' }, this.lightNextEl, 'Light up the next chord on the keyboard'),
            ),
            this.chordsEl,
            this.warningEl,
            this.feedbackEl,
            h(
              'div',
              { class: 'row buttons' },
              h('button', { onclick: () => this.hearBest() }, '▶ Hear the smoothest way'),
              h('button', { onclick: () => this.hearChord(), title: 'Shortcut: Space' }, 'Hear chord'),
              h('button', { onclick: () => this.reveal() }, 'Show me'),
              h('button', { onclick: () => this.skipChord() }, 'Skip chord'),
              h('button', { onclick: () => this.restart() }, 'Restart'),
              h('button', { onclick: () => this.nextKey() }, 'Next key ↻'),
            ),
          ),
          h('div', { class: 'card' }, this.scoreEl),
        ),
        h(
          'div',
          { class: 'card view-card' },
          h('div', { class: 'card-header' }, h('nav', { class: 'view-tabs' }, this.tabs.sheet, this.tabs.lines)),
          this.viewHost,
        ),
      ),
    );

    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat || isTyping(e)) return;
      e.preventDefault();
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      this.hearChord();
    };
    window.addEventListener('keydown', onKey);
    this.cleanup.push(
      () => window.removeEventListener('keydown', onKey),
      this.app.input.changed.on((held) => this.evaluate(held)),
      this.app.settings.subscribe(() => this.onSettings()),
    );
    this.restart();
  }

  unmount(): void {
    this.cleanup.forEach((fn) => fn());
    this.cleanup = [];
    this.cancelPlayback();
    clearTimeout(this.badTimer);
    this.app.keyboard.setMarks(new Map());
    this.app.keyboard.setLabels(new Map());
  }

  private get settings(): Settings {
    return this.app.settings.value;
  }

  private sourceId(s: Settings): string {
    return `${s.progressionId}|${getProgression(s).text}|${s.keySig}:${s.keyMode}|${s.voiceStyle}|${s.startFrom}`;
  }

  private onSettings(): void {
    const s = this.settings;
    this.picker.sync();
    this.lightNextEl.checked = s.lightNext;
    if (this.sourceId(s) !== this.source) return this.restart();
    this.bestPath = suggestPath(this.targets, demoRange(s), s.allowed); // the window or allowed notes may have changed
    this.evaluate(this.app.input.held);
    this.renderAll();
  }

  // --- Flow ---

  private restart(): void {
    const s = this.settings;
    const progression = getProgression(s);
    this.source = this.sourceId(s);
    this.chords = realizeProgression(progression.steps, getKey(s));
    this.baseTargets = this.chords.map((c) => styleTarget(c, s.voiceStyle));
    this.targets = applyStart(this.baseTargets, s.startFrom);
    this.start.sync(this.baseTargets.length ? startOptions(this.baseTargets[0]) : []);
    this.runner = progression.error ? null : new ProgressionRunner(this.targets);
    this.bestPath = suggestPath(this.targets, demoRange(s), s.allowed);
    this.revealed = [];
    this.stopPlayback();
    this.styleSelect.value = s.voiceStyle;
    this.lightNextEl.checked = s.lightNext;
    this.styleNote.textContent = VOICING_STYLES.find((st) => st.id === s.voiceStyle)?.description ?? '';
    this.setFeedback('', '');
    this.renderAll();
    this.evaluate(this.app.input.held);
  }

  private nextKey(): void {
    const s = this.settings;
    const next = wrapSignature(s.keySig + (s.circleDirection === 'fifths' ? 1 : -1));
    this.app.settings.update({
      ...keyChange(s, next, s.keyMode, s.circleMovesAllowed),
      startFrom: nextStart(this.baseTargets, s),
    });
  }

  private evaluate(held: number[]): void {
    clearTimeout(this.badTimer);
    const runner = this.runner;
    const s = this.settings;
    const key = getKey(s);
    if (!runner || runner.finished) {
      this.app.keyboard.setMarks(new Map());
      this.app.keyboard.setLabels(chordLabels(held, null, key));
      return;
    }
    const { check, solved } = runner.feed(held, getConstraint(s), playableRange(s));
    const target = solved ? runner.targets[runner.index - 1] : runner.current!;
    if (solved) this.revealed = [];
    if (check) {
      this.heldVerdict = check.verdict;
      this.heldChord = target.chord;
    }
    this.paint();

    if (solved) {
      const r = runner.results[runner.results.length - 1];
      const form = voicingForm(held, target.chord);
      let text = `✓ ${chordSymbol(target.chord)}${form && s.voiceStyle === 'rootless' ? ` (${form} form)` : ''}`;
      if (r.moved !== null) {
        text += ` · moved ${r.moved}`;
        text += r.smoothest !== null && r.smoothest < r.moved ? ` (smoothest: ${r.smoothest})` : ' (smoothest!)';
      }
      this.setFeedback('ok', runner.finished ? `${text}. Done!` : text);
      this.renderAll();
    } else if (check?.complete) {
      // Wait a moment: the notes of a chord arrive one by one, and the rest may be on the way.
      const text = describeCheck(check, target, held, key, getConstraint(s));
      this.badTimer = window.setTimeout(() => this.setFeedback('bad', text), 250);
    } else this.clearError();
  }

  // --- Hints ---

  /** Suggested voicings for the chords not played yet, continuing from what you played. */
  private continuation(): number[][] {
    const runner = this.runner;
    if (!runner) return [];
    const s = this.settings;
    const rest = this.targets.slice(runner.index);
    const start = runner.previous.length ? runner.previous : undefined;
    return suggestRoute(rest, demoRange(s), s.allowed, start);
  }

  /** Says why a hint can't be played instead of silently doing nothing. */
  private cantPlay(targets: readonly Target[]): void {
    const s = this.settings;
    const why = playabilityProblem(targets, demoRange(s), s.allowed, getKey(s)) ?? 'no voicing fits';
    this.setFeedback('bad', `Can’t play that: ${why}.`);
  }

  private hearChord(): void {
    const target = this.runner?.current;
    if (!target) return;
    const s = this.settings;
    const notes = suggestVoicing(target, this.runner!.previous, demoRange(s), s.allowed);
    if (notes) playAndShow(this.app, notes, target.chord);
    else this.cantPlay([target]);
  }

  private reveal(): void {
    const target = this.runner?.current;
    if (!target) return;
    const [next] = this.continuation();
    if (!next?.length) return this.cantPlay([target]);
    this.revealed = next;
    playAndShow(this.app, next, target.chord);
    this.paint();
  }

  private skipChord(): void {
    const runner = this.runner;
    if (!runner?.current) return;
    runner.skip();
    this.revealed = [];
    this.heldVerdict = null;
    this.setFeedback('', runner.finished ? 'Done!' : '');
    this.renderAll();
  }

  private hearBest(): void {
    const s = this.settings;
    // Chords the limits rule out are left silent rather than stopping the whole demo.
    const path = this.bestPath ?? suggestRoute(this.targets, demoRange(s), s.allowed);
    if (!path.some((v) => v.length)) return this.cantPlay(this.targets);
    this.stopPlayback();
    this.playback = { path, index: null };
    this.renderView();
    const steps = path.map((notes, i) => ({ notes, chord: this.chords[i] }));
    this.cancelPlayback = playSequence(this.app, steps, (i) => {
      if (!this.playback) return;
      this.playback.index = i;
      if (i === null) this.stopPlayback();
      else this.highlightSheet();
    });
  }

  /** Ends "Hear the smoothest way": the views go back to your own chords. */
  private stopPlayback(): void {
    this.cancelPlayback();
    if (!this.playback) return;
    this.playback = null;
    this.renderView();
  }

  // --- Rendering ---

  private setFeedback(kind: '' | 'ok' | 'bad', text: string): void {
    clearTimeout(this.badTimer);
    this.feedbackEl.className = `feedback ${kind}`;
    this.feedbackEl.textContent = text;
  }

  /** Clears an error once the held notes no longer make a wrong chord. */
  private clearError(): void {
    clearTimeout(this.badTimer);
    if (this.feedbackEl.classList.contains('bad')) this.setFeedback('', '');
  }

  /** Show-me hints and suggestions for the current chord, and held notes marked right or wrong. */
  private paint(): void {
    const held = this.app.input.held;
    if (!held.length) this.heldVerdict = null;
    const current = this.runner?.current;
    const hints = [...new Set([...this.revealed, ...this.suggested])];
    // While a hint is up, judge held notes against the chord it is for, not the one just played.
    const judged = hints.length && current;
    paintKeys(
      this.app.keyboard,
      getKey(this.settings),
      {
        notes: held,
        verdict: judged ? checkTarget(held, current, getConstraint(this.settings)).verdict : this.heldVerdict,
        chord: judged ? current.chord : this.heldChord,
      },
      { notes: hints, chord: current?.chord ?? null },
    );
  }

  private graphNotes(notes: readonly number[], chord: Chord, key: Key): GraphNote[] {
    const tones = withTensions(chord);
    const root = pcOf(chord.root);
    const spelled = spellNotes(notes, chord, key, tones);
    return notes.map((midi, i) => {
      const role = tones.find((t) => mod12(root + t.semitones) === mod12(midi));
      return {
        midi,
        name: noteName(spelled[i]),
        role: role ? toneLabel(role) : '',
        guide: !!role && isGuideTone(chord, role),
      };
    });
  }

  /** Warns about any chord still to come that the current limits make impossible. */
  private updateWarning(): void {
    const s = this.settings;
    const error = getProgression(s).error;
    const remaining = this.targets.slice(this.runner?.index ?? 0);
    const problem = playabilityProblem(remaining, playableRange(s), s.allowed, getKey(s));
    this.warningEl.textContent =
      error ?? (problem ? `${problem}, so it can’t be played here. Change the limits in the sidebar, or skip it.` : '');
  }

  private renderAll(): void {
    const s = this.settings;
    const key = getKey(s);
    this.updateWarning();
    const runner = this.runner;
    const index = runner?.index ?? 0;
    const results = runner?.results ?? [];
    const continuation = this.continuation();
    this.suggested = s.lightNext ? (continuation[0] ?? []) : [];
    this.paint();

    render(
      this.chordsEl,
      this.chords.map((chord, i) => {
        const state = i < index ? 'done' : i === index ? 'current' : 'todo';
        const form = results[i] && s.voiceStyle === 'rootless' ? voicingForm(results[i].notes, chord) : null;
        return [
          i > 0 ? h('span', { class: 'arrow' }, '→') : null,
          h(
            'div',
            { class: `step-chip ${state}` },
            h('b', {}, results[i]?.notes.length && s.voiceStyle === 'full' ? playedSymbol(results[i].notes, chord) : chordSymbol(chord)),
            h('small', {}, romanNumeral(pcOf(chord.root), chord.quality, key)),
            form ? h('small', { class: 'moved' }, `${form} form`) : null,
          ),
        ];
      }),
    );
    this.renderScore();
    this.renderView(continuation);
  }

  private highlightSheet(): void {
    const runner = this.runner;
    const current = runner && !runner.finished && !this.playback ? runner.index : null;
    this.sheet?.highlight(current, this.playback?.index ?? null);
  }

  /** The sheet music or voice-lines tab: what you played, then suggestions (or what "Hear" is playing). */
  private renderView(continuation = this.continuation()): void {
    const s = this.settings;
    const key = getKey(s);
    const runner = this.runner;
    // Sheet music can be switched off in the sidebar; the voice lines are always available.
    const view = s.showStaff ? s.voiceView : 'lines';
    this.tabs.sheet.style.display = s.showStaff ? '' : 'none';
    this.tabs.sheet.classList.toggle('active', view === 'sheet');
    this.tabs.lines.classList.toggle('active', view === 'lines');
    if (!runner) return render(this.viewHost);
    const voicings = this.playback?.path ?? displayVoicings(runner, continuation);
    const played = (i: number) => !this.playback && i < runner.index;

    if (view === 'sheet') {
      const bars = this.chords.map((c, i) => sheetChord(voicings[i] ?? [], c, key, chordSymbol(c)));
      this.sheet = sheetMusic(bars, s.keySig);
      render(this.viewHost, this.sheet.el);
      this.highlightSheet();
      return;
    }
    this.sheet = null;
    const columns: GraphColumn[] = this.chords.map((chord, i) => {
      const notes = voicings[i] ?? [];
      const result = played(i) ? runner.results[i] : undefined;
      const form = notes.length && s.voiceStyle === 'rootless' ? voicingForm(notes, chord) : null;
      const sub = [form ? `${form} form` : '', result?.moved != null ? `moved ${result.moved}` : played(i) ? '' : 'suggested']
        .filter(Boolean)
        .join(' · ');
      return {
        label: chordSymbol(chord),
        sub,
        notes: this.graphNotes(notes, chord, key),
        ghost: !played(i),
        current: !this.playback && i === runner.index,
      };
    });
    render(this.viewHost, h('div', { class: 'graph-host' }, voiceGraph(columns)), this.legendEl);
  }

  private renderScore(): void {
    const runner = this.runner;
    const results = (runner?.results ?? []).filter((r) => r.notes.length);
    const best = this.bestPath ? totalMotion(this.bestPath) : null;
    if (results.length < 2) {
      render(
        this.scoreEl,
        h(
          'p',
          { class: 'muted' },
          best !== null
            ? `Play the chords in order. The smoothest route through this progression moves ${best} semitones in total.`
            : 'This progression can’t be voiced in this style inside the current key window and allowed notes.',
        ),
      );
      return;
    }

    const notes = results.map((r) => r.notes);
    const moved = totalMotion(notes);
    let smooth = 0;
    let guides = 0;
    let held = 0;
    for (let i = 1; i < notes.length; i++) {
      const g = guideToneMotion(notes[i - 1], this.chords[i - 1], notes[i]);
      smooth += g.smooth;
      guides += g.total;
      held += voiceLeading(notes[i - 1], notes[i]).common.length;
    }
    const s = this.settings;
    const fromStart = suggestPath(this.targets.slice(1, results.length), demoRange(s), s.allowed, notes[0]);
    const bestFromStart = fromStart ? totalMotion([notes[0], ...fromStart]) : null;

    const stat = (label: string, value: string | number) =>
      h('div', { class: 'stat' }, h('b', {}, String(value)), h('small', {}, label));
    render(
      this.scoreEl,
      h(
        'div',
        { class: 'stat-row' },
        stat('semitones moved', moved),
        stat('smoothest from your first chord', bestFromStart ?? '–'),
        stat('guide tones by step', guides ? `${smooth}/${guides}` : '–'),
        stat('notes held over', held),
      ),
      runner?.finished && best !== null && bestFromStart !== null && best < bestFromStart
        ? h('p', { class: 'muted' }, `Starting from a different voicing, the whole progression can move as little as ${best}.`)
        : null,
    );
  }
}
