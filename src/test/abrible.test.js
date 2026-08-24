// Las tarjetas de la carta, alcanzables con el teclado.
//
// Lo que importa que sea cierto:
//   - que la tarjeta se anuncie y se enfoque. Sin `role` ni `tabIndex`, un div
//     con onClick no existe para el Tab ni para un lector de pantalla: con
//     mouse abre el producto y con teclado no pasa nada;
//   - que Enter y Space abran, porque es lo que hace un boton de verdad;
//   - que Space PREVENGA el scroll. En un div focusable la barra espaciadora
//     scrollea la pagina, y sin eso la carta se va saltando mientras se
//     intenta abrir un producto;
//   - que otras teclas no abran nada: bajar por la carta con las flechas no
//     puede terminar abriendo el producto sobre el que uno pasa.

import { describe, it, expect, vi } from 'vitest';
import { abrible } from '../catalog-pro/atoms';

const tecla = (key) => ({ key, preventDefault: vi.fn() });

describe('la tarjeta se comporta como un botón', () => {
  it('se anuncia y el Tab la alcanza', () => {
    const p = abrible(() => {}, 'Ver Papas fritas grandes');
    expect(p.role).toBe('button');
    expect(p.tabIndex).toBe(0);
    expect(p['aria-label']).toBe('Ver Papas fritas grandes');
  });

  it('el click sigue abriendo', () => {
    const abrir = vi.fn();
    abrible(abrir).onClick();
    expect(abrir).toHaveBeenCalledTimes(1);
  });

  it('Enter abre', () => {
    const abrir = vi.fn();
    abrible(abrir).onKeyDown(tecla('Enter'));
    expect(abrir).toHaveBeenCalledTimes(1);
  });

  it('Space abre y no scrollea', () => {
    const abrir = vi.fn();
    const e = tecla(' ');
    abrible(abrir).onKeyDown(e);
    expect(abrir).toHaveBeenCalledTimes(1);
    expect(e.preventDefault).toHaveBeenCalled();
  });

  it('las flechas no abren nada', () => {
    const abrir = vi.fn();
    const e = tecla('ArrowDown');
    abrible(abrir).onKeyDown(e);
    expect(abrir).not.toHaveBeenCalled();
    expect(e.preventDefault).not.toHaveBeenCalled();
  });
});

describe('sin handler no finge ser interactiva', () => {
  it('una tarjeta que no abre nada no se anuncia como botón', () => {
    // Prometer un botón que no hace nada es peor que no tener botón: quien
    // navega con teclado se detiene en algo que no responde.
    expect(abrible(null)).toEqual({});
    expect(abrible(undefined)).toEqual({});
  });
});
