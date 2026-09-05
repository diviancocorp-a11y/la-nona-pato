// Los siete roles (Etapa 6f, seccion 4 del plan).
//
// Lo que importa que sea cierto: que quien atiende NO llegue a la plata, que
// tener dos roles sume permisos en vez de restarlos, y que cada uno caiga en
// una pantalla que existe.
//
// Esto prueba la NAVEGACION. Que los datos esten protegidos de verdad lo
// prueba RLS (0050), y se verifica contra la base — no desde aca.

import { describe, it, expect } from 'vitest';
import {
  ROLES, ACCESO, accesoDe, accesoDeRoles, puedeVer, puedeEditar,
  pantallaInicial, rolesAsignables, etiquetaDeRol, vePrecios,
  puedeAbrirDestino,
} from '../modules/roles';

const MODULOS_GASTRO = ['products', 'orders', 'mesas', 'caja', 'stock', 'finanzas', 'ventas', 'personal'];

describe('la matriz respeta el plan', () => {
  it('el duenio ve todo lo que hay', () => {
    for (const m of MODULOS_GASTRO) {
      expect(puedeVer(['owner'], m), `owner deberia ver ${m}`).toBe(true);
    }
  });

  it('quien atiende NO llega a la plata del local', () => {
    // Es el corte que justifica toda la etapa.
    expect(puedeVer(['attendant'], 'finanzas')).toBe(false);
    expect(puedeVer(['kitchen'], 'finanzas')).toBe(false);
    expect(puedeVer(['kitchen'], 'ventas')).toBe(false);
    expect(puedeVer(['cashier'], 'finanzas')).toBe(false);
  });

  it('el mozo ve SUS ventas, no las del local', () => {
    // Necesita su comision y sus propinas; no el total facturado.
    expect(accesoDe('attendant', 'ventas')).toBe(ACCESO.PROPIO);
    expect(accesoDe('owner', 'ventas')).toBe(ACCESO.COMPLETO);
  });

  it('la cocina no ve precios: mira productos, no los toca', () => {
    expect(accesoDe('kitchen', 'products')).toBe(ACCESO.LECTURA);
    expect(puedeEditar(['kitchen'], 'products')).toBe(false);
  });

  it('el contador ve los numeros y no la operacion', () => {
    expect(puedeVer(['accountant'], 'ventas')).toBe(true);
    expect(puedeVer(['accountant'], 'mesas')).toBe(false);
    expect(puedeVer(['accountant'], 'personal')).toBe(false);
  });

  it('el encargado no maneja la configuracion como el duenio', () => {
    expect(accesoDe('manager', 'finanzas')).toBe(ACCESO.PROPIO);
    expect(accesoDe('owner', 'finanzas')).toBe(ACCESO.COMPLETO);
  });

  it('un modulo que nadie declaro queda oculto, no visible para todos', () => {
    // La matriz declara lo que SE VE. Asi, agregar un modulo nuevo y olvidarse
    // de la matriz lo deja escondido, que es el olvido seguro.
    expect(puedeVer(['attendant'], 'modulo_que_no_existe')).toBe(false);
    expect(puedeVer(['owner'], 'modulo_que_no_existe')).toBe(false);
  });
});

describe('varios roles suman, no restan', () => {
  it('barbero y cajero puede hacer las dos cosas', () => {
    const r = ['attendant', 'cashier'];
    expect(puedeVer(r, 'caja')).toBe(true);
    expect(puedeVer(r, 'mesas')).toBe(true);
  });

  it('gana el acceso mas amplio de los dos', () => {
    // attendant tiene `propio` sobre orders; cashier tiene `completo`.
    expect(accesoDeRoles(['attendant', 'cashier'], 'orders')).toBe(ACCESO.COMPLETO);
  });

  it('sumar un rol nunca saca lo que ya tenia', () => {
    for (const m of MODULOS_GASTRO) {
      const solo = accesoDeRoles(['owner'], m);
      const con = accesoDeRoles(['owner', 'kitchen'], m);
      expect(con, `sumar kitchen no puede degradar ${m}`).toBe(solo);
    }
  });

  it('sin roles no se ve nada', () => {
    expect(puedeVer([], 'products')).toBe(false);
    expect(puedeVer(undefined, 'products')).toBe(false);
  });
});

describe('donde cae cada uno al entrar', () => {
  it('cada rol abre en su pantalla', () => {
    expect(pantallaInicial(['cashier'], MODULOS_GASTRO)).toBe('caja');
    expect(pantallaInicial(['attendant'], MODULOS_GASTRO)).toBe('mesas');
    expect(pantallaInicial(['accountant'], MODULOS_GASTRO)).toBe('ventas');
  });

  it('si su pantalla no existe en este negocio, cae en otra que si pueda ver', () => {
    // Un cajero en un negocio sin caja (solo a distancia).
    const sinCaja = ['products', 'orders'];
    expect(pantallaInicial(['cashier'], sinCaja)).toBe('products');
  });

  it('nunca devuelve una pantalla que el rol no puede ver', () => {
    // Un contador en un negocio que no tiene ni ventas ni finanzas.
    expect(pantallaInicial(['accountant'], ['mesas', 'personal'])).toBe(null);
  });

  it('con dos roles abre en el mas amplio', () => {
    expect(pantallaInicial(['cashier', 'owner'], MODULOS_GASTRO)).toBe('products');
  });
});

describe('que roles se pueden asignar', () => {
  it('una barberia no ofrece Cocina', () => {
    const ids = rolesAsignables('barberia', 'fisico').map(r => r.id);
    expect(ids).not.toContain('kitchen');
    expect(ids).toContain('attendant');
  });

  it('un negocio solo a distancia tampoco', () => {
    const ids = rolesAsignables('gastro', 'virtual').map(r => r.id);
    expect(ids).not.toContain('kitchen');
  });

  it('un local gastronomico si', () => {
    const ids = rolesAsignables('gastro', 'fisico').map(r => r.id);
    expect(ids).toContain('kitchen');
  });

  it('el duenio se puede asignar siempre', () => {
    for (const [v, m] of [['gastro', 'fisico'], ['barberia', 'virtual'], ['retail', 'fisico']]) {
      expect(rolesAsignables(v, m).map(r => r.id)).toContain('owner');
    }
  });
});

describe('el vocabulario lo pone el rubro', () => {
  it('attendant se llama distinto en cada uno', () => {
    expect(etiquetaDeRol('attendant', { operario: 'Barbero' })).toBe('Barbero');
    expect(etiquetaDeRol('attendant', { operario: 'Vendedor' })).toBe('Vendedor');
  });

  it('sin terminologia cae en el nombre por defecto', () => {
    expect(etiquetaDeRol('attendant', null)).toBe('Mozo');
    expect(etiquetaDeRol('cashier', null)).toBe('Cajero');
  });

  it('los siete roles del plan estan, y solo esos', () => {
    expect(Object.keys(ROLES)).toEqual([
      'owner', 'manager', 'cashier', 'attendant', 'kitchen', 'marketer', 'accountant',
    ]);
  });
});

describe('la cocina no ve importes', () => {
  it('solo cocina: sin precios', () => {
    expect(vePrecios(['kitchen'])).toBe(false);
  });

  it('pero si ademas cobra, si', () => {
    // Alguien que cocina y atiende la caja es cajero: un cajero ve importes.
    expect(vePrecios(['kitchen', 'cashier'])).toBe(true);
  });

  it('todos los demas ven importes', () => {
    for (const r of ['owner', 'manager', 'cashier', 'attendant', 'marketer', 'accountant']) {
      expect(vePrecios([r]), `${r} deberia ver importes`).toBe(true);
    }
  });

  it('sin roles no ve nada, tampoco importes', () => {
    expect(vePrecios([])).toBe(false);
  });
});

// P0-1 del smoke del 4/9/2026: Configuracion, Cobros y Usuarios no son
// modulos del rubro, y el panel rebotaba a `products` cualquier tab que no
// estuviera en la lista de modulos. Sin estos destinos declarados, el
// engranaje no abre nada.
describe('los destinos que no son modulos', () => {
  it('el duenio abre los tres', () => {
    for (const d of ['config', 'cobros', 'usuarios']) {
      expect(puedeAbrirDestino(['owner'], d), d).toBe(true);
    }
  });

  it('el encargado configura el negocio, pero no toca cobros ni el equipo', () => {
    expect(puedeAbrirDestino(['manager'], 'config')).toBe(true);
    expect(puedeAbrirDestino(['manager'], 'cobros')).toBe(false);
    expect(puedeAbrirDestino(['manager'], 'usuarios')).toBe(false);
  });

  it('quien atiende no entra a ninguno', () => {
    for (const d of ['config', 'cobros', 'usuarios']) {
      expect(puedeAbrirDestino(['attendant'], d), d).toBe(false);
      expect(puedeAbrirDestino(['cashier'], d), d).toBe(false);
    }
  });

  it('un modulo comun no es un destino suelto', () => {
    expect(puedeAbrirDestino(['owner'], 'products')).toBe(false);
    expect(puedeAbrirDestino(['owner'], undefined)).toBe(false);
  });
});
