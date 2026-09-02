import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const fuente = readFileSync(join(process.cwd(), 'src/catalog-pro/PromoCarousel.jsx'), 'utf8');

describe('PromoCarousel — contenido que se actualiza solo', () => {
  it('no auto-avanza cuando el usuario pidio menos movimiento', () => {
    // WCAG 2.2.2: contenido que se actualiza solo tiene que poder pararse.
    // Apagar la transicion por CSS no alcanza — el slide igual cambiaba cada
    // 4,5s, sin animacion pero sin aviso.
    //
    // Y es la fuente de un nondeterminismo real: un `setInterval` es un timer
    // de JS que el harness de QA no puede congelar, asi que dos corridas del
    // mismo commit fotografiaban el carrusel en estados distintos.
    expect(fuente).toContain('useMediaQuery("(prefers-reduced-motion: reduce)")');
    const efecto = fuente.match(/useEffect\(\(\) => \{\s*if \(len < 2[^}]*\}[\s\S]*?\}, \[len[^\]]*\]\);/);
    expect(efecto, 'no encontre el efecto de autoplay').not.toBeNull();
    expect(efecto[0], 'el autoplay no mira reduced motion').toContain('menosMovimiento');
    expect(efecto[0], 'reduced motion no esta en las dependencias').toMatch(/\[len[^\]]*menosMovimiento[^\]]*\]/);
  });

  it('la salida temprana corta ANTES de armar el intervalo', () => {
    // Si el guard estuviera adentro del callback, el timer existiria igual y
    // el efecto se reprogramaria: el DOM seguiria siendo impredecible.
    const efecto = fuente.match(/if \(len < 2[^\n]*\n\s*const t = setInterval/);
    expect(efecto, 'el guard no esta antes del setInterval').not.toBeNull();
  });
});
