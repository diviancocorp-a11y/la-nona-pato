import { describe, expect, it } from 'vitest';
import { ANCLAJES, INTERVENCIONES, intervencionDe, sigueVigente } from '../modules/dico/intervenciones';

const t = { singular: 'plato', nuevo: '+ Agregar plato' };

describe('intervenciones — el contrato', () => {
  it('declara exactamente los dos casos autorizados', () => {
    expect([...INTERVENCIONES]).toEqual(['catalogo-vacio', 'nada-visible']);
    expect([...ANCLAJES]).toEqual(['presence', 'target']);
  });

  it('no devuelve nada ante un evento desconocido o mal formado', () => {
    for (const basura of [null, undefined, {}, { tipo: 42 }, { tipo: 'margen-negativo' }, { tipo: 'guardo-producto' }]) {
      expect(intervencionDe(basura, { terminologia: t })).toBeNull();
    }
  });

  it('solo usa las poses autorizadas, y ninguna de las otras seis', () => {
    const salidas = [
      intervencionDe({ tipo: 'entro-al-catalogo', productos: 0 }, { terminologia: t }),
      intervencionDe({ tipo: 'cambio-visibilidad', visiblesAntes: 3, visiblesAhora: 0 }, { terminologia: t }),
    ];
    expect(salidas.map((i) => i.pose)).toEqual(['pointDown', 'worried']);
    // Las que el lote NO autoriza no pueden aparecer por ningun camino.
    for (const prohibida of ['idle', 'explain', 'pointUp', 'thinking', 'success', 'error']) {
      expect(salidas.map((i) => i.pose)).not.toContain(prohibida);
    }
  });

  it('anclar al objetivo con una pose que no senala es un error, no un default', () => {
    // `target` significa "el dedo cae sobre el CTA". Con una pose que no
    // senala, anclar ahi no significa nada y taparia el objetivo por gusto.
    expect(() => intervencionDe({ tipo: 'entro-al-catalogo', productos: 0 }, { terminologia: t }))
      .not.toThrow();
    const conPresence = intervencionDe(
      { tipo: 'cambio-visibilidad', visiblesAntes: 1, visiblesAhora: 0 }, { terminologia: t },
    );
    expect(conPresence.anclaje).toBe('presence');
  });
});

describe('intervenciones — catalogo vacio', () => {
  it('entrar al catalogo vacio la dispara, con pose direccional y anclaje al objetivo', () => {
    const i = intervencionDe({ tipo: 'entro-al-catalogo', productos: 0 }, { terminologia: t });
    expect(i.id).toBe('catalogo-vacio');
    expect(i.pose).toBe('pointDown');
    expect(i.anclaje).toBe('target');
    expect(i.cta).toEqual({ texto: '+ Agregar plato', accion: 'crear-producto' });
    expect(i.mensaje).toContain('primer plato');
  });

  it('con productos cargados no dispara', () => {
    expect(intervencionDe({ tipo: 'entro-al-catalogo', productos: 4 }, { terminologia: t })).toBeNull();
  });

  it('no vuelve a salir si ya se mostro en la sesion', () => {
    // "No como popup repetitivo en cada entrada": volver cinco veces a la
    // pestania no lo trae cinco veces.
    const ctx = { terminologia: t, vistas: ['catalogo-vacio'] };
    expect(intervencionDe({ tipo: 'entro-al-catalogo', productos: 0 }, ctx)).toBeNull();
  });

  it('usa la terminologia del rubro, no la palabra "producto" clavada', () => {
    const i = intervencionDe({ tipo: 'entro-al-catalogo', productos: 0 },
      { terminologia: { singular: 'corte', nuevo: '+ Agregar corte' } });
    expect(i.mensaje).toContain('primer corte');
    expect(i.cta.texto).toBe('+ Agregar corte');
  });
});

describe('intervenciones — nada visible: los tres casos', () => {
  it('A) el usuario apaga el ultimo visible -> dispara', () => {
    const i = intervencionDe({ tipo: 'cambio-visibilidad', visiblesAntes: 1, visiblesAhora: 0 }, { terminologia: t });
    expect(i.id).toBe('nada-visible');
    expect(i.pose).toBe('worried');
    expect(i.anclaje).toBe('presence');
  });

  it('B) montar con cero visibles NO dispara', () => {
    // No hay transicion: nadie apago nada. Este es el caso que separa una
    // intervencion de un popup al entrar.
    expect(intervencionDe({ tipo: 'cambio-visibilidad', visiblesAntes: 0, visiblesAhora: 0 }, { terminologia: t }))
      .toBeNull();
    // Y el evento de entrada tampoco la trae por la ventana de al lado.
    expect(intervencionDe({ tipo: 'entro-al-catalogo', productos: 5 }, { terminologia: t })).toBeNull();
  });

  it('C) re-render con cero visibles NO vuelve a dispararla', () => {
    // Un re-render reporta el mismo 0 -> 0: sin transicion, sin intervencion.
    for (let i = 0; i < 5; i += 1) {
      expect(intervencionDe({ tipo: 'cambio-visibilidad', visiblesAntes: 0, visiblesAhora: 0 }, { terminologia: t }))
        .toBeNull();
    }
  });

  it('apagar uno de varios no dispara: sigue habiendo pagina', () => {
    expect(intervencionDe({ tipo: 'cambio-visibilidad', visiblesAntes: 3, visiblesAhora: 2 }, { terminologia: t }))
      .toBeNull();
  });

  it('volver a mostrar uno tampoco dispara', () => {
    expect(intervencionDe({ tipo: 'cambio-visibilidad', visiblesAntes: 0, visiblesAhora: 1 }, { terminologia: t }))
      .toBeNull();
  });
});

describe('intervenciones — cuando dejan de tener sentido', () => {
  it('catalogo-vacio se cierra en cuanto hay un producto', () => {
    const i = intervencionDe({ tipo: 'entro-al-catalogo', productos: 0 }, { terminologia: t });
    expect(sigueVigente(i, { productos: 0 })).toBe(true);
    expect(sigueVigente(i, { productos: 1 })).toBe(false);
  });

  it('nada-visible se cierra en cuanto vuelve a haber uno visible', () => {
    const i = intervencionDe({ tipo: 'cambio-visibilidad', visiblesAntes: 2, visiblesAhora: 0 }, { terminologia: t });
    expect(sigueVigente(i, { visibles: 0 })).toBe(true);
    expect(sigueVigente(i, { visibles: 1 })).toBe(false);
  });

  it('sin intervencion activa no hay nada vigente', () => {
    expect(sigueVigente(null, { productos: 0 })).toBe(false);
  });

  it('no hay timers: la vigencia depende del ESTADO, no del tiempo', () => {
    // Las dos son "espera accion". Si aparecieran duraciones aca, seria un
    // auto-dismiss por segundos disfrazado.
    const fuente = intervencionDe({ tipo: 'entro-al-catalogo', productos: 0 }, { terminologia: t });
    expect(Object.keys(fuente)).toEqual(['id', 'pose', 'mensaje', 'cta', 'anclaje']);
  });
});
