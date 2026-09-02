#!/usr/bin/env node
/**
 * Dico 2D: masters -> derivados productivos.
 *
 *   node scripts/dico-2d-derivar.mjs [--check]
 *
 * Lee `platform/brand/dico-2d-masters/` y escribe `public/brand/dico/`.
 * Con `--check` no escribe: falla si lo que hay en disco no coincide, para que
 * nadie edite un derivado a mano y quede desincronizado del master.
 *
 * ─────────────────────────── QUE HACE, Y POR QUE ───────────────────────────
 *
 * 1. NORMALIZA EL ALFA. Los masters vienen con el cuerpo pintado en alfa
 *    251-254 en vez de 255: un export casi-opaco. No es checkerboard ni fondo
 *    incrustado —el 51% del canvas es alfa 0 de verdad— pero deja al personaje
 *    con hasta un 1,6% de mezcla con lo que tenga debajo. Medido sobre damero:
 *    el mismo pixel de oro daba distinto segun cayera sobre cuadro claro u
 *    oscuro (diferencia media 0,378-0,400 sobre 255).
 *
 *      a == 0    ->  0      el fondo se queda en cero
 *      1..244    ->  igual  ES el antialiasing del borde y NO se toca
 *      a >= 245  ->  255    el cuerpo pasa a opaco
 *
 *    El RGB no se toca: verificado byte a byte, 0 diferencias en los siete.
 *
 * 2. REDUCE A 256px. Dico 2D se pinta a 32-44px en la sidebar; incluso a 3x son
 *    132px. Servir el master serian 4,7 MB para dibujar un icono; los derivados
 *    pesan 392 KB en total.
 *
 *    La reduccion usa promedio de area con ALFA PREMULTIPLICADA. Sin
 *    premultiplicar, los pixeles transparentes arrastran su color al promedio y
 *    aparece una orla clara alrededor del personaje.
 *
 *    El inverso de la premultiplicacion usa el alfa YA REDONDEADO. Con el sin
 *    redondear, un pixel cuyo alfa cae a 0 al redondear conservaba RGB
 *    amplificado: quedaban 223 pixeles con alfa 0 y color residual. Al componer
 *    no molestan —alfa 0 no pinta— pero es basura que un visor que ignore el
 *    alfa convertiria en halo.
 *
 * NO se redibuja, NO se regenera, NO se modifican ojos ni cejas, NO se agrega
 * boca. Los masters quedan intactos.
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { PNG } from 'pngjs';

const MASTERS = 'platform/brand/dico-2d-masters';
const DESTINO = 'public/brand/dico';
const LADO = 256;
const UMBRAL_OPACO = 245;
const check = process.argv.includes('--check');

function normalizarAlfa(png) {
  const { data } = png;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] >= UMBRAL_OPACO) data[i] = 255;
  }
  return png;
}

function reducir(src, lado) {
  const out = new PNG({ width: lado, height: lado });
  const fx = src.width / lado, fy = src.height / lado;
  for (let y = 0; y < lado; y++) {
    for (let x = 0; x < lado; x++) {
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      const x0 = Math.floor(x * fx), x1 = Math.min(src.width, Math.ceil((x + 1) * fx));
      const y0 = Math.floor(y * fy), y1 = Math.min(src.height, Math.ceil((y + 1) * fy));
      for (let sy = y0; sy < y1; sy++) for (let sx = x0; sx < x1; sx++) {
        const i = (sy * src.width + sx) * 4;
        const al = src.data[i + 3] / 255;
        r += src.data[i] * al; g += src.data[i + 1] * al; b += src.data[i + 2] * al;
        a += src.data[i + 3]; n++;
      }
      const di = (y * lado + x) * 4;
      const am = Math.round(a / n);
      const inv = am > 0 ? 255 / am : 0;
      out.data[di] = am > 0 ? Math.round(r / n * inv) : 0;
      out.data[di + 1] = am > 0 ? Math.round(g / n * inv) : 0;
      out.data[di + 2] = am > 0 ? Math.round(b / n * inv) : 0;
      out.data[di + 3] = am;
    }
  }
  return out;
}

if (!existsSync(MASTERS)) {
  console.error(`No existe ${MASTERS}`);
  process.exit(1);
}
mkdirSync(DESTINO, { recursive: true });

let desincronizados = 0;
for (const f of readdirSync(MASTERS).filter(n => n.endsWith('.png')).sort()) {
  const master = PNG.sync.read(readFileSync(join(MASTERS, f)));
  const bytes = PNG.sync.write(reducir(normalizarAlfa(master), LADO), { deflateLevel: 9 });
  const destino = join(DESTINO, f);
  const sha = createHash('sha256').update(bytes).digest('hex').slice(0, 12);

  if (check) {
    const actual = existsSync(destino)
      ? createHash('sha256').update(readFileSync(destino)).digest('hex').slice(0, 12) : '(falta)';
    const ok = actual === sha;
    if (!ok) desincronizados++;
    console.log(`${ok ? 'OK ' : 'X  '} ${f.padEnd(23)} esperado ${sha}  en disco ${actual}`);
  } else {
    writeFileSync(destino, bytes);
    console.log(`OK  ${f.padEnd(23)} ${master.width}px -> ${LADO}px  ${(bytes.length / 1024).toFixed(0)} KB  ${sha}`);
  }
}

if (check && desincronizados) {
  console.error(`\n${desincronizados} derivado(s) no coinciden con su master. Correr sin --check para regenerarlos.`);
  process.exit(1);
}
