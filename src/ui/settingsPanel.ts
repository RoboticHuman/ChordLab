import { RANGES, type Settings, type Store, allowedFor } from '../state';
import { PC_PRESETS } from '../theory/constraint';
import { CIRCLE_SIGNATURES, keyFromSignature, keyName, keySignature } from '../theory/keys';
import { isBlackKey, midiName, noteName, pcOf, pcSetHas, spellPc } from '../theory/notes';
import { h } from './dom';

function signatureLabel(sig: number): string {
  if (sig === 0) return 'no ♯/♭';
  return sig > 0 ? `${sig}♯` : `${-sig}♭`;
}

/** Key options in circle order, including both F♯ and G♭. */
function keyOptions(): HTMLOptionElement[] {
  const sigs = [...CIRCLE_SIGNATURES.slice(0, 7), -6, ...CIRCLE_SIGNATURES.slice(7)];
  return (['major', 'minor'] as const).flatMap((mode) =>
    sigs.map((sig) => {
      const key = keyFromSignature(sig, mode);
      return h('option', { value: `${sig}:${mode}` }, `${keyName(key)} (${signatureLabel(keySignature(key))})`);
    }),
  );
}

/** The sidebar with settings shared by every mode: key, allowed notes, key window, keyboard. */
export function settingsPanel(store: Store<Settings>): HTMLElement {
  const set = (patch: Partial<Settings>) => store.update(patch);

  const keySelect = h(
    'select',
    {
      onchange: (e: Event) => {
        const [sig, mode] = (e.target as HTMLSelectElement).value.split(':');
        set({ keySig: Number(sig), keyMode: mode as Settings['keyMode'] });
      },
    },
    keyOptions(),
  );

  const presetSelect = h(
    'select',
    {
      onchange: (e: Event) => {
        const preset = (e.target as HTMLSelectElement).value;
        const s = store.value;
        set({ allowedPreset: preset, allowed: allowedFor(preset, s.allowedTonic, s.allowed) });
      },
    },
    h('option', { value: 'all' }, 'All 12 notes'),
    PC_PRESETS.map((p) => h('option', { value: p.id }, p.name)),
    h('option', { value: 'custom' }, 'Custom'),
  );

  const tonicSelect = h(
    'select',
    {
      onchange: (e: Event) => {
        const tonic = Number((e.target as HTMLSelectElement).value);
        const s = store.value;
        set({ allowedTonic: tonic, allowed: allowedFor(s.allowedPreset, tonic, s.allowed) });
      },
    },
    Array.from({ length: 12 }, (_, pc) => h('option', { value: pc }, noteName(spellPc(pc)))),
  );

  const useKeyButton = h(
    'button',
    {
      class: 'small',
      title: 'Allow only the notes of the current key',
      onclick: () => {
        const s = store.value;
        const key = keyFromSignature(s.keySig, s.keyMode);
        const preset = s.keyMode === 'major' ? 'major' : 'minor';
        const tonic = pcOf(key.tonic);
        set({ allowedPreset: preset, allowedTonic: tonic, allowed: allowedFor(preset, tonic, s.allowed) });
      },
    },
    'Use key',
  );

  const pcButtons = Array.from({ length: 12 }, (_, pc) =>
    h(
      'button',
      {
        class: `pc ${isBlackKey(pc) ? 'black' : 'white'}`,
        title: 'Allow or forbid this note',
        onclick: () => set({ allowedPreset: 'custom', allowed: store.value.allowed ^ (1 << pc) }),
      },
      noteName(spellPc(pc)),
    ),
  );

  const windowToggle = h('input', {
    type: 'checkbox',
    onchange: (e: Event) => set({ windowOn: (e.target as HTMLInputElement).checked }),
  });
  const windowLowLabel = h('span', { class: 'window-low' });
  const shiftWindow = (by: number) => set({ windowLow: Math.max(21, Math.min(108, store.value.windowLow + by)) });
  const windowSize = h('input', {
    type: 'number',
    min: 3,
    max: 88,
    onchange: (e: Event) => {
      const n = Math.round(Number((e.target as HTMLInputElement).value));
      if (n >= 3 && n <= 88) set({ windowSize: n });
    },
  });
  const windowRangeLabel = h('div', { class: 'muted' });

  const rangeSelect = h(
    'select',
    { onchange: (e: Event) => set({ rangeId: (e.target as HTMLSelectElement).value }) },
    RANGES.map((r) => h('option', { value: r.id }, r.name)),
  );
  const latchToggle = h('input', {
    type: 'checkbox',
    onchange: (e: Event) => set({ latch: (e.target as HTMLInputElement).checked }),
  });
  const soundToggle = h('input', {
    type: 'checkbox',
    onchange: (e: Event) => set({ sound: (e.target as HTMLInputElement).checked }),
  });

  const windowControls = h(
    'div',
    { class: 'row' },
    h('button', { class: 'small', title: 'Move window down a key', onclick: () => shiftWindow(-1) }, '◀'),
    windowLowLabel,
    h('button', { class: 'small', title: 'Move window up a key', onclick: () => shiftWindow(1) }, '▶'),
    h('label', { class: 'inline' }, windowSize, ' keys'),
  );

  const panel = h(
    'aside',
    { class: 'settings' },
    h(
      'section',
      {},
      h('h3', {}, 'Key'),
      keySelect,
      h('p', { class: 'muted' }, 'Used to spell notes and name chords by scale degree (ii, V7, …).'),
    ),
    h(
      'section',
      {},
      h('h3', {}, 'Allowed notes'),
      h('div', { class: 'row' }, presetSelect, h('span', { class: 'muted' }, 'on'), tonicSelect, useKeyButton),
      h('div', { class: 'pc-grid' }, pcButtons),
      h('p', { class: 'muted' }, 'Forbidden notes are hatched on the keyboard. Click a note to toggle it.'),
    ),
    h(
      'section',
      {},
      h('h3', {}, 'Key window'),
      h('label', { class: 'check' }, windowToggle, 'Keep every chord inside a window'),
      windowControls,
      windowRangeLabel,
      h(
        'p',
        { class: 'muted' },
        'A 12-key window means most chords only fit in one inversion, so you have to find it. That is voice leading.',
      ),
    ),
    h(
      'section',
      {},
      h('h3', {}, 'Keyboard'),
      rangeSelect,
      h('label', { class: 'check' }, latchToggle, 'Mouse clicks latch notes (Esc clears)'),
      h('label', { class: 'check' }, soundToggle, 'Sound'),
    ),
  );

  const sync = (s: Settings) => {
    keySelect.value = `${s.keySig}:${s.keyMode}`;
    presetSelect.value = s.allowedPreset;
    tonicSelect.value = String(s.allowedTonic);
    tonicSelect.disabled = s.allowedPreset === 'all' || s.allowedPreset === 'custom';
    pcButtons.forEach((b, pc) => b.classList.toggle('on', pcSetHas(s.allowed, pc)));
    windowToggle.checked = s.windowOn;
    windowControls.classList.toggle('disabled', !s.windowOn);
    windowLowLabel.textContent = `from ${midiName(s.windowLow)}`;
    if (document.activeElement !== windowSize) windowSize.value = String(s.windowSize);
    windowRangeLabel.textContent = s.windowOn
      ? `${midiName(s.windowLow)} – ${midiName(s.windowLow + s.windowSize - 1)}`
      : 'Off: any key may be used.';
    rangeSelect.value = s.rangeId;
    latchToggle.checked = s.latch;
    soundToggle.checked = s.sound;
  };
  store.subscribe(sync);
  sync(store.value);
  return panel;
}
