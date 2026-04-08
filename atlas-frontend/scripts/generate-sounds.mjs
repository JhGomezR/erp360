/**
 * Genera archivos WAV de notificación en public/sounds/
 * Ejecutar: node scripts/generate-sounds.mjs
 */
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '..', 'public', 'sounds');
mkdirSync(outDir, { recursive: true });

const SAMPLE_RATE = 44100;
const CHANNELS    = 1;
const BIT_DEPTH   = 16;

/** Genera samples PCM para un tono sinusoidal con fade-in/out */
function sineWave({ freq, duration, volume = 0.5, fadeIn = 0.01, fadeOut = 0.08 }) {
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples    = new Int16Array(numSamples);
  const max        = 32767 * volume;

  for (let i = 0; i < numSamples; i++) {
    const t        = i / SAMPLE_RATE;
    let   envelope = 1;

    if (t < fadeIn)                        envelope = t / fadeIn;
    else if (t > duration - fadeOut)       envelope = (duration - t) / fadeOut;

    samples[i] = Math.round(Math.sin(2 * Math.PI * freq * t) * max * envelope);
  }
  return samples;
}

/** Concatena arrays de Int16 */
function concat(...arrays) {
  const total  = arrays.reduce((s, a) => s + a.length, 0);
  const result = new Int16Array(total);
  let   offset = 0;
  for (const a of arrays) { result.set(a, offset); offset += a.length; }
  return result;
}

/** Inserta silencio entre tonos */
function silence(seconds) {
  return new Int16Array(Math.floor(SAMPLE_RATE * seconds));
}

/** Construye un Buffer WAV a partir de samples Int16 */
function buildWav(samples) {
  const dataSize   = samples.length * 2;
  const buffer     = Buffer.alloc(44 + dataSize);
  let   o          = 0;

  buffer.write('RIFF', o); o += 4;
  buffer.writeUInt32LE(36 + dataSize, o); o += 4;
  buffer.write('WAVE', o); o += 4;
  buffer.write('fmt ', o); o += 4;
  buffer.writeUInt32LE(16, o); o += 4;                          // PCM
  buffer.writeUInt16LE(1, o);  o += 2;                          // AudioFormat
  buffer.writeUInt16LE(CHANNELS, o); o += 2;
  buffer.writeUInt32LE(SAMPLE_RATE, o); o += 4;
  buffer.writeUInt32LE(SAMPLE_RATE * CHANNELS * BIT_DEPTH / 8, o); o += 4;
  buffer.writeUInt16LE(CHANNELS * BIT_DEPTH / 8, o); o += 2;
  buffer.writeUInt16LE(BIT_DEPTH, o); o += 2;
  buffer.write('data', o); o += 4;
  buffer.writeUInt32LE(dataSize, o); o += 4;

  for (let i = 0; i < samples.length; i++) {
    buffer.writeInt16LE(samples[i], o); o += 2;
  }
  return buffer;
}

// ─── Definición de sonidos ────────────────────────────────────────────────────

const sounds = {
  // Info: chime suave ascendente Do→Mi
  'notify-info': concat(
    sineWave({ freq: 523, duration: 0.18, volume: 0.40 }),
    silence(0.05),
    sineWave({ freq: 659, duration: 0.26, volume: 0.35, fadeOut: 0.12 }),
  ),

  // Warning / Billing: doble pulso urgente La→Fa→La
  'notify-warning': concat(
    sineWave({ freq: 440, duration: 0.12, volume: 0.50, fadeOut: 0.05 }),
    silence(0.06),
    sineWave({ freq: 349, duration: 0.12, volume: 0.50, fadeOut: 0.05 }),
    silence(0.08),
    sineWave({ freq: 440, duration: 0.18, volume: 0.40, fadeOut: 0.10 }),
  ),

  // System: nota neutral única Sol
  'notify-system': concat(
    sineWave({ freq: 392, duration: 0.22, volume: 0.30, fadeOut: 0.12 }),
  ),
};

for (const [name, samples] of Object.entries(sounds)) {
  const file = join(outDir, `${name}.wav`);
  writeFileSync(file, buildWav(samples));
  console.log(`✔ ${name}.wav  (${samples.length} samples)`);
}

console.log(`\nArchivos generados en: ${outDir}`);
