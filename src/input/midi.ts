import type { NoteInput } from './noteInput';

export interface MidiStatus {
  state: 'unsupported' | 'pending' | 'ready' | 'denied';
  inputs: string[];
}

/** Listens to every connected MIDI input (e.g. an Arturia KeyStep) and feeds note on/off into `input`. */
export async function connectMidi(input: NoteInput, onStatus: (status: MidiStatus) => void): Promise<void> {
  if (!('requestMIDIAccess' in navigator)) {
    onStatus({ state: 'unsupported', inputs: [] });
    return;
  }
  onStatus({ state: 'pending', inputs: [] });
  let access: MIDIAccess;
  try {
    access = await navigator.requestMIDIAccess();
  } catch {
    onStatus({ state: 'denied', inputs: [] });
    return;
  }

  const handle = (e: MIDIMessageEvent) => {
    const data = e.data;
    if (!data || data.length < 3) return;
    const command = data[0] & 0xf0;
    const [, note, velocity] = data;
    if (command === 0x90 && velocity > 0) input.press(note, 'midi', velocity / 127);
    else if (command === 0x80 || command === 0x90) input.release(note, 'midi');
    else if (command === 0xb0 && note === 64) input.setPedal(velocity >= 64); // CC64: sustain pedal
  };

  const refresh = () => {
    const ports = [...access.inputs.values()];
    for (const port of ports) port.onmidimessage = handle;
    onStatus({ state: 'ready', inputs: ports.map((p) => p.name ?? 'MIDI input') });
  };

  access.onstatechange = (e) => {
    // A device unplugged mid-chord would otherwise leave its notes stuck on.
    if (e.port?.type === 'input' && e.port.state === 'disconnected') {
      input.setPedal(false);
      input.releaseAll('midi');
    }
    refresh();
  };
  refresh();
}
