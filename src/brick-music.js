export function parseBrickMidi(data) {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  let offset = 0;
  const u16 = i => (bytes[i] << 8) | bytes[i + 1];
  const u32 = i => (bytes[i] * 0x1000000 + (bytes[i + 1] << 16) + (bytes[i + 2] << 8) + bytes[i + 3]) >>> 0;
  const tag = i => String.fromCharCode(...bytes.subarray(i, i + 4));
  const variable = end => {
    let value = 0;
    for (let i = 0; i < 4; i++) {
      if (offset >= end) throw Error("Truncated MIDI event");
      const byte = bytes[offset++];
      value = (value << 7) | (byte & 127);
      if (!(byte & 128)) return value;
    }
    throw Error("Invalid MIDI delta");
  };

  if (bytes.length < 14 || tag(0) !== "MThd") throw Error("Not a MIDI file");
  const headerSize = u32(4), format = u16(8), trackCount = u16(10), division = u16(12);
  if (headerSize < 6 || 8 + headerSize > bytes.length || format > 1 ||
      trackCount < 1 || trackCount > 64 || !division || (division & 0x8000)) {
    throw Error("Unsupported MIDI format");
  }
  offset = 8 + headerSize;
  const groups = new Map();

  for (let track = 0; track < trackCount; track++) {
    if (offset + 8 > bytes.length || tag(offset) !== "MTrk") throw Error("Missing MIDI track");
    const length = u32(offset + 4);
    offset += 8;
    const end = offset + length;
    if (end > bytes.length) throw Error("Truncated MIDI track");
    let tick = 0, running = 0;
    while (offset < end) {
      tick += variable(end);
      let status = bytes[offset];
      if (status & 128) {
        offset++;
        if (status < 0xf0) running = status;
        else running = 0;
      } else {
        status = running;
        if (!status) throw Error("Invalid MIDI running status");
      }
      if (status === 0xff || status === 0xf0 || status === 0xf7) {
        if (status === 0xff) {
          if (offset >= end) throw Error("Truncated MIDI metadata");
          offset++;
        }
        const size = variable(end);
        if (offset + size > end) throw Error("Truncated MIDI metadata");
        offset += size;
        continue;
      }
      const kind = status & 0xf0, channel = status & 15;
      const size = kind === 0xc0 || kind === 0xd0 ? 1 : 2;
      if (status < 0x80 || status >= 0xf0 || offset + size > end) throw Error("Invalid MIDI event");
      const note = bytes[offset++], velocity = size === 2 ? bytes[offset++] : 0;
      if (kind === 0x90 && velocity > 0 && channel !== 9) {
        const key = track + ":" + channel;
        if (!groups.has(key)) groups.set(key, []);
        if (groups.get(key).length < 20000) groups.get(key).push({tick, note, velocity});
      }
    }
    offset = end;
  }
  const channels = [...groups.values()].filter(notes => notes.length);
  if (!channels.length) throw Error("No instrumental MIDI notes found");
  channels.sort((a, b) => b.length - a.length);
  const notes = channels[0].sort((a, b) => a.tick - b.tick || b.note - a.note);
  const melody = notes.filter((event, index) => index === 0 || event.tick !== notes[index - 1].tick);
  return melody.map(event => event.note);
}

export function createBrickSequencer() {
  let notes = [], position = 0;
  return {
    load(data) {
      const parsed = parseBrickMidi(data);
      notes = parsed;
      position = 0;
      return notes.length;
    },
    clear() { notes = []; position = 0; },
    reset() { position = 0; },
    next() {
      if (!notes.length) return null;
      let note = notes[position++ % notes.length];
      while (note < 55) note += 12;
      while (note > 88) note -= 12;
      return {frequency: 440 * Math.pow(2, (note - 69) / 12), volume: .2, duration: .14, wave: "triangle"};
    }
  };
}

export function createBrickMusic(host) {
  const doc = host.document, select = doc.getElementById("musicTrack"),
    input = doc.getElementById("midiFile"), status = doc.getElementById("midiStatus"),
    button = doc.getElementById("loadMidi");
  const sequencer = createBrickSequencer(), memory = new Map();
  let requestId = 0;

  function openStore() {
    return new Promise((resolve, reject) => {
      if (!host.indexedDB) { reject(Error("MIDI storage unavailable")); return; }
      const request = host.indexedDB.open("bricks-asmr-midi", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("songs");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  async function read(id) {
    const db = await openStore();
    return new Promise((resolve, reject) => {
      const request = db.transaction("songs", "readonly").objectStore("songs").get(id);
      request.onsuccess = () => { db.close(); resolve(request.result); };
      request.onerror = () => { db.close(); reject(request.error); };
    });
  }
  async function save(id, data) {
    const db = await openStore();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("songs", "readwrite");
      transaction.objectStore("songs").put(data, id);
      transaction.oncomplete = () => { db.close(); resolve(); };
      transaction.onerror = () => { db.close(); reject(transaction.error); };
    });
  }
  async function choose(id) {
    const version = ++requestId;
    sequencer.clear();
    status.textContent = "LOAD AN INSTRUMENTAL MIDI FILE";
    let data = memory.get(id);
    if (!data) {
      try { data = await read(id); } catch {}
    }
    if (version !== requestId || !data) return;
    try {
      const length = sequencer.load(data);
      status.textContent = "READY · " + length + " NOTES";
    } catch {
      status.textContent = "INVALID MIDI FILE · LOAD AGAIN";
    }
  }
  try {
    const saved = host.localStorage.getItem("bricks-midi-selected");
    if ([...select.options].some(option => option.value === saved)) select.value = saved;
  } catch {}
  select.addEventListener("change", () => {
    try { host.localStorage.setItem("bricks-midi-selected", select.value); } catch {}
    choose(select.value);
  });
  button.addEventListener("click", () => input.click());
  input.addEventListener("change", async () => {
    const file = input.files && input.files[0];
    input.value = "";
    if (!file) return;
    if (file.size > 1024 * 1024) {
      status.textContent = "MIDI FILE MUST BE UNDER 1 MB";
      return;
    }
    const id = select.value, version = ++requestId;
    try {
      const data = await file.arrayBuffer();
      if (version !== requestId) return;
      const length = sequencer.load(data);
      memory.set(id, data);
      status.textContent = "READY · " + length + " NOTES";
      try { await save(id, data); } catch {
        status.textContent = "READY FOR THIS SESSION · " + length + " NOTES";
      }
    } catch {
      if (version === requestId) status.textContent = "INVALID MIDI FILE · LOAD AGAIN";
    }
  });
  choose(select.value);
  return {next: () => sequencer.next(), reset: () => sequencer.reset()};
}
