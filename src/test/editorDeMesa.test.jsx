// El alta de mesas y las zonas (Etapa 6c).
//
// Lo que importa que sea cierto:
//   - que cargar la mesa numero veinte no cueste lo mismo que la primera;
//   - que la zona se ELIJA de las que ya hay, para que "Patio" y "patio" no
//     terminen siendo dos pestanias con una mesa cada una;
//   - que dar de baja no pase de un solo toque;
//   - que las pestanias de zona aparezcan cuando hacen falta y no antes.

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import EditorDeMesa from '../components/admin/platform/EditorDeMesa';
import MapaDeMesas from '../components/admin/platform/MapaDeMesas';
import { siguienteNombre } from '../services/platformScheduling';

const borrador = (over = {}) => ({
  kind: 'table', name: '6', capacity: 4, shape: 'round', ...over,
});

describe('siguienteNombre', () => {
  it('arranca en 1 cuando no hay nada', () => {
    expect(siguienteNombre([])).toBe('1');
  });

  it('sigue la numeracion', () => {
    expect(siguienteNombre([{ name: '11' }, { name: '12' }])).toBe('13');
  });

  it('respeta el prefijo', () => {
    expect(siguienteNombre([{ name: 'Barra 3' }])).toBe('Barra 4');
  });

  it('respeta los ceros de relleno', () => {
    expect(siguienteNombre([{ name: 'mesa 09' }])).toBe('mesa 10');
  });

  it('no inventa cuando el nombre no termina en numero', () => {
    // "VIP2" seria peor que dejar que lo escriba la persona.
    expect(siguienteNombre([{ name: 'VIP' }])).toBe('');
  });
});

describe('EditorDeMesa — alta', () => {
  it('llega con el nombre y la forma ya puestos', () => {
    render(<EditorDeMesa recurso={borrador()} />);
    expect(screen.getByDisplayValue('6')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Redonda/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('guarda lo que se ve en pantalla', async () => {
    const onGuardar = vi.fn().mockResolvedValue({ ok: true });
    render(<EditorDeMesa recurso={borrador({ pos_x: 40, pos_y: 60 })} onGuardar={onGuardar} />);
    fireEvent.click(screen.getByRole('button', { name: /Cuadrada/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Más lugares' }));
    fireEvent.click(screen.getByRole('button', { name: 'Agregar al plano' }));
    await waitFor(() => expect(onGuardar).toHaveBeenCalledWith(expect.objectContaining({
      name: '6', capacity: 5, shape: 'square', pos_x: 40, pos_y: 60,
    })));
  });

  it('no deja guardar sin nombre', () => {
    const onGuardar = vi.fn();
    render(<EditorDeMesa recurso={borrador({ name: '' })} onGuardar={onGuardar} />);
    fireEvent.click(screen.getByRole('button', { name: 'Agregar al plano' }));
    expect(onGuardar).not.toHaveBeenCalled();
  });

  it('los lugares no bajan de uno', () => {
    render(<EditorDeMesa recurso={borrador({ capacity: 1 })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Menos lugares' }));
    expect(screen.getByLabelText('Cantidad de lugares').value).toBe('1');
  });
});

describe('EditorDeMesa — la zona se elige', () => {
  it('con zonas existentes muestra la lista, no un campo libre', () => {
    render(<EditorDeMesa recurso={borrador()} zonas={['Adentro', 'Patio']} />);
    const select = screen.getByRole('combobox');
    expect([...select.options].map(o => o.textContent))
      .toEqual(['Sin zona', 'Adentro', 'Patio', '+ Zona nueva…']);
  });

  it('sin ninguna zona todavia, deja escribir la primera', () => {
    render(<EditorDeMesa recurso={borrador()} zonas={[]} />);
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Adentro, patio, terraza/)).toBeInTheDocument();
  });

  it('crear una zona nueva pide el nombre y lo guarda', async () => {
    const onGuardar = vi.fn().mockResolvedValue({ ok: true });
    render(<EditorDeMesa recurso={borrador()} zonas={['Adentro']} onGuardar={onGuardar} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '__nueva__' } });
    fireEvent.change(screen.getByLabelText('Nombre de la zona nueva'), {
      target: { value: 'Terraza' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Agregar al plano' }));
    await waitFor(() => expect(onGuardar).toHaveBeenCalledWith(
      expect.objectContaining({ zone: 'Terraza' }),
    ));
  });

  it('no guarda una zona nueva sin nombre', () => {
    const onGuardar = vi.fn();
    render(<EditorDeMesa recurso={borrador()} zonas={['Adentro']} onGuardar={onGuardar} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '__nueva__' } });
    fireEvent.click(screen.getByRole('button', { name: 'Agregar al plano' }));
    expect(onGuardar).not.toHaveBeenCalled();
  });
});

describe('EditorDeMesa — edicion y baja', () => {
  it('editando, el boton no dice agregar', () => {
    render(<EditorDeMesa recurso={{ ...borrador(), id: 'r1' }} />);
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeInTheDocument();
  });

  it('la baja necesita dos toques', async () => {
    const onArchivar = vi.fn().mockResolvedValue(true);
    render(<EditorDeMesa recurso={{ ...borrador(), id: 'r1' }} onArchivar={onArchivar} />);
    fireEvent.click(screen.getByRole('button', { name: /Dar de baja/ }));
    expect(onArchivar).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Tocá de nuevo/ }));
    await waitFor(() => expect(onArchivar).toHaveBeenCalledWith('r1'));
  });

  it('una mesa nueva no ofrece darse de baja', () => {
    render(<EditorDeMesa recurso={borrador()} onArchivar={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /Dar de baja/ })).not.toBeInTheDocument();
  });

  it('muestra el error de la base sin cerrarse', async () => {
    const onGuardar = vi.fn().mockResolvedValue({
      __error: 'db', message: 'Ya hay otra con ese nombre en este local.',
    });
    const onCerrar = vi.fn();
    render(<EditorDeMesa recurso={borrador()} onGuardar={onGuardar} onCerrar={onCerrar} />);
    fireEvent.click(screen.getByRole('button', { name: 'Agregar al plano' }));
    expect(await screen.findByText('Ya hay otra con ese nombre en este local.')).toBeInTheDocument();
    expect(onCerrar).not.toHaveBeenCalled();
  });
});

const mesa = (over = {}) => ({
  id: 'r1', name: '1', capacity: 4, shape: 'round', pos_x: 30, pos_y: 40, ...over,
});

describe('MapaDeMesas — pestanias de zona', () => {
  it('con una sola zona no hay pestanias que elegir', () => {
    render(<MapaDeMesas recursos={[mesa({ zone: 'Adentro' }), mesa({ id: 'r2', name: '2', zone: 'Adentro' })]} />);
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
  });

  it('con dos zonas aparecen, y se ve una por vez', () => {
    render(<MapaDeMesas recursos={[
      mesa({ id: 'r1', name: '1', zone: 'Adentro' }),
      mesa({ id: 'r2', name: '2', zone: 'Patio' }),
    ]} />);
    expect(screen.getByRole('tab', { name: 'Adentro' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Patio' })).toBeInTheDocument();
    // Arranca en la primera: la mesa del patio no esta en pantalla.
    expect(screen.getByLabelText(/^1,/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^2,/)).not.toBeInTheDocument();
  });

  it('cambiar de pestania cambia lo que se ve', () => {
    render(<MapaDeMesas recursos={[
      mesa({ id: 'r1', name: '1', zone: 'Adentro' }),
      mesa({ id: 'r2', name: '2', zone: 'Patio' }),
    ]} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Patio' }));
    expect(screen.getByLabelText(/^2,/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^1,/)).not.toBeInTheDocument();
  });

  it('las que no tienen zona no se pierden: caen en su propia pestania', () => {
    render(<MapaDeMesas recursos={[
      mesa({ id: 'r1', name: '1', zone: 'Adentro' }),
      mesa({ id: 'r2', name: '2', zone: null }),
    ]} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Sin zona' }));
    expect(screen.getByLabelText(/^2,/)).toBeInTheDocument();
  });
});

describe('MapaDeMesas — crear tocando el plano', () => {
  function tocarPlano(container, onNuevo) {
    // El lienzo es el div con el aspect ratio; se lo ubica por su hijo mesa.
    const lienzo = container.querySelector('[data-mesa]')?.parentElement
      || container.querySelector('section > div[style*="aspect-ratio"]');
    lienzo.getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 250 });
    fireEvent.click(lienzo, { clientX: 200, clientY: 125 });
    return onNuevo;
  }

  it('en modo servicio, tocar el plano NO crea nada', () => {
    const onNuevo = vi.fn();
    const { container } = render(
      <MapaDeMesas recursos={[mesa({ zone: 'Adentro' })]} onNuevo={onNuevo} />,
    );
    tocarPlano(container, onNuevo);
    expect(onNuevo).not.toHaveBeenCalled();
  });

  it('en modo acomodar, crea en el punto tocado y con la zona abierta', () => {
    const onNuevo = vi.fn();
    const { container } = render(
      <MapaDeMesas
        recursos={[mesa({ zone: 'Adentro' }), mesa({ id: 'r2', name: '2', zone: 'Patio' })]}
        onNuevo={onNuevo}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Acomodar salón' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Patio' }));
    tocarPlano(container, onNuevo);
    expect(onNuevo).toHaveBeenCalledWith({ pos_x: 50, pos_y: 50, zone: 'Patio' });
  });

  it('el boton + crea sin posicion, para cargar sin dibujar', () => {
    const onNuevo = vi.fn();
    render(<MapaDeMesas recursos={[mesa({ zone: 'Adentro' })]} onNuevo={onNuevo} />);
    fireEvent.click(screen.getByRole('button', { name: /Nueva mesa/ }));
    expect(onNuevo).toHaveBeenCalledWith({ zone: 'Adentro' });
  });
});
