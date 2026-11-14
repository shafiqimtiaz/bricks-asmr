export function createBrickMusic() {
  // New, lightweight arcade arrangements of melodies in the public domain.
  // Numbers are MIDI pitches; no recordings, samples, or third-party arrangements are used.
  const tunes = [
    {
      name: "Korobeiniki", wave: "square", step: .075, duration: .12,
      notes: [76,71,72,74,72,71,69,69,72,76,74,72,71,71,72,74,
        76,72,69,69,74,77,81,79,77,76,72,76,74,72,71,71]
    },
    {
      name: "Für Elise", wave: "triangle", step: .085, duration: .16,
      notes: [76,75,76,75,76,71,74,72,69,60,64,69,71,64,68,71,
        72,64,76,75,76,75,76,71,74,72,69,60,64,69,71,64,72,71,69]
    },
    {
      name: "Ode to Joy", wave: "triangle", step: .11, duration: .19,
      notes: [64,64,65,67,67,65,64,62,60,60,62,64,64,62,62,
        64,64,65,67,67,65,64,62,60,60,62,64,62,60,60]
    },
    {
      name: "In the Hall of the Mountain King", wave: "square", step: .072, duration: .13,
      notes: [59,61,62,64,66,62,66,64,61,64,59,61,62,61,59,61,
        62,64,66,62,66,71,69,66,62,66,69,71,74,71,69,66]
    },
    {
      name: "Jingle Bells", wave: "triangle", step: .095, duration: .15,
      notes: [64,64,64,64,64,64,64,67,60,62,64,65,65,65,65,
        65,64,64,64,64,62,62,64,62,67,64,64,64,64,64,64]
    },
    {
      name: "Rondo alla Turca", wave: "square", step: .075, duration: .13,
      notes: [71,69,68,69,72,74,76,74,72,71,72,74,76,
        74,72,71,69,68,69,71,72,74,76,77,76,74,72,71,69]
    },
    {
      name: "When the Saints Go Marching In", wave: "triangle", step: .09, duration: .16,
      notes: [60,64,65,67,60,64,65,67,60,64,65,67,64,60,64,62,
        60,64,65,67,67,67,65,64,64,64,60,62,60]
    },
    {
      name: "Bach Prelude in C", wave: "sine", step: .065, duration: .17,
      notes: [60,64,67,72,76,67,72,76,60,64,67,72,76,67,72,76,
        60,62,69,74,77,69,74,77,59,62,67,74,77,67,74,77]
    },
    {
      name: "Twinkle Twinkle Little Star", wave: "sine", step: .11, duration: .19,
      notes: [60,60,67,67,69,69,67,65,65,64,64,62,62,60,
        67,67,65,65,64,64,62,67,67,65,65,64,64,62]
    },
    {
      name: "Minuet in G", wave: "triangle", step: .083, duration: .15,
      notes: [67,72,74,67,72,74,76,74,72,71,69,71,72,74,
        67,72,74,67,72,74,76,74,72,71,69,71,72]
    }
  ];

  let tune = tunes[0], position = 0, nextAt = 0;

  function reset(seed = "") {
    let hash = 2166136261;
    const key = String(seed);
    for (let i = 0; i < key.length; i++) hash = Math.imul(hash ^ key.charCodeAt(i), 16777619);
    tune = tunes[(hash >>> 0) % tunes.length];
    position = 0;
    nextAt = 0;
    return tune.name;
  }

  function next() {
    let pitch = tune.notes[position++ % tune.notes.length];
    while (pitch < 55) pitch += 12;
    while (pitch > 88) pitch -= 12;
    return {
      frequency: 440 * Math.pow(2, (pitch - 69) / 12),
      volume: tune.wave === "square" ? .085 : tune.wave === "sine" ? .18 : .17,
      duration: tune.duration,
      wave: tune.wave
    };
  }

  function hit(soundKit) {
    if (!soundKit) return false;
    const now = soundKit.context.currentTime;
    const delay = Math.max(0, nextAt - now);
    if (delay > .45) return false;
    const note = next();
    soundKit.blip(note.frequency, note.volume, note.duration, note.wave, delay);
    nextAt = now + delay + tune.step;
    return true;
  }

  return {
    reset, next, hit,
    get name() { return tune.name; },
    get length() { return tune.notes.length; },
    get count() { return tunes.length; }
  };
}
