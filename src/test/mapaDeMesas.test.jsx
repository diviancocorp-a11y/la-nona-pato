// El plano del salon (Etapa 6c).
//
// Lo que se prueba es lo que el mozo necesita que sea cierto: que cada mesa
// muestre en que esta, que el arrastre no se dispare durante el servicio, y
// que una mesa sin ubicar en el plano siga siendo usable.

import { describe, it, expect, vi } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import MapaDeMesas from '../components/admin/platform/MapaDeMesas';

const mesa = (over = {}) => ({
  id: 'm1', name: 'Mesa 1', capacity: 4, zone: 'Patio',
  pos_x: 30, pos_y: 40, shape: 'round', ...over,
});

describe('MapaDeMesas', () => {
  it('dibuja las mesas ubicadas con su capacidad', () => {
    render(<MapaDeMesas recursos={[mesa(), mesa({ id: 'm2', name: 'Mesa 2', capacity: 1, pos_x: 60 })]} />);
    expect(screen.getByText('Mesa 1')).toBeInTheDocument();
    expect(screen.getByText('4 lugares')).toBeInTheDocument();
    // Singular cuando es una sola: "1 lugares" se lee mal en una silla.
    expect(screen.getByText('1 lugar')).toBeInTheDocument();
  });

  it('el estado sale de las reservas, no de un campo de la mesa', () => {
    // Es lo que hace que el plano sirva en vivo: no hay que marcar la mesa a
    // mano, lo dice la reserva.
    const recursos = [mesa(), mesa({ id: 'm2', name: 'Mesa 2', pos_x: 60 }), mesa({ id: 'm3', name: 'Mesa 3', pos_x: 80 })];
    const reservas = [
      { resource_id: 'm1', status: 'in_service' },
      { resource_id: 'm2', status: 'booked' },
    ];
    render(<MapaDeMesas recursos={recursos} reservas={reservas} />);
    expect(screen.getByLabelText(/Mesa 1.*Ocupada/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Mesa 2.*Reservada/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Mesa 3.*Libre/)).toBeInTheDocument();
  });

  it('una reserva cancelada no ocupa la mesa', () => {
    render(<MapaDeMesas recursos={[mesa()]} reservas={[{ resource_id: 'm1', status: 'cancelled' }]} />);
    expect(screen.getByLabelText(/Mesa 1.*Libre/)).toBeInTheDocument();
  });

  it('en servicio, tocar una mesa la selecciona y NO la mueve', async () => {
    // El riesgo real: un toque torcido en un telefono moviendo el salon en
    // plena hora pico.
    const onSeleccionar = vi.fn();
    const onMover = vi.fn();
    render(<MapaDeMesas recursos={[mesa()]} onSeleccionar={onSeleccionar} onMover={onMover} />);

    fireEvent.click(screen.getByLabelText(/Mesa 1/));
    expect(onSeleccionar).toHaveBeenCalledTimes(1);
    expect(onMover).not.toHaveBeenCalled();
  });

  it('en modo acomodar, tocar NO dispara la seleccion', async () => {
    const onSeleccionar = vi.fn();
    render(<MapaDeMesas recursos={[mesa()]} onSeleccionar={onSeleccionar} onMover={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /Acomodar salón/i }));
    fireEvent.click(screen.getByLabelText(/Mesa 1/));
    expect(onSeleccionar).not.toHaveBeenCalled();
  });

  it('el modo acomodar se avisa y se puede salir', async () => {
    render(<MapaDeMesas recursos={[mesa()]} onMover={vi.fn()} />);
    const boton = screen.getByRole('button', { name: /Acomodar salón/i });

    fireEvent.click(boton);
    expect(screen.getByText(/Arrastrá las mesas/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Listo' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Listo' }));
    expect(screen.queryByText(/Arrastrá las mesas/i)).not.toBeInTheDocument();
  });

  it('una mesa sin ubicar aparece en la bandeja y sigue siendo usable', async () => {
    // Dibujar el salon es OPCIONAL. Obligar a hacerlo antes de tomar la primera
    // reserva seria absurdo, asi que lo no ubicado tiene que verse igual.
    const onSeleccionar = vi.fn();
    render(
      <MapaDeMesas
        recursos={[mesa(), mesa({ id: 'm9', name: 'Mesa nueva', pos_x: null, pos_y: null })]}
        onSeleccionar={onSeleccionar}
      />
    );
    expect(screen.getByText(/Sin ubicar en el plano \(1\)/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Mesa nueva/ }));
    expect(onSeleccionar).toHaveBeenCalledWith(expect.objectContaining({ id: 'm9' }));
  });

  it('sin nada ubicado explica que hacer, sin dejar el plano mudo', () => {
    render(<MapaDeMesas recursos={[]} />);
    expect(screen.getByText(/Todavía no dibujaste tu salón/i)).toBeInTheDocument();
    expect(screen.getByText(/Empezá creando una mesa/i)).toBeInTheDocument();
  });

  it('la utilizacion muestra lo que NO se vendio, no solo el porcentaje', () => {
    // "Vendiste X" no le dice nada al dueño que no sepa. "Te quedaron 12 horas
    // sin vender" si.
    render(<MapaDeMesas recursos={[mesa()]} utilizacion={{
      recursos: 4, horas_disponibles: 40, horas_vendidas: 28, utilizacion_pct: 70,
    }} />);
    expect(screen.getByText('70%')).toBeInTheDocument();
    expect(screen.getByText(/12 h libres/)).toBeInTheDocument();
  });

  it('la referencia de colores no depende solo del color', () => {
    // El color se lee de lejos, pero solo el color no es accesible.
    const { container } = render(<MapaDeMesas recursos={[mesa()]} />);
    for (const t of ['Libre', 'Reservada', 'Ocupada']) {
      expect(within(container).getAllByText(t).length).toBeGreaterThan(0);
    }
  });

  it('usa la terminologia del rubro', () => {
    // Una barberia no tiene "mesas": tiene sillones.
    render(<MapaDeMesas recursos={[]} terminologia={{ plural: 'Sillones', singular: 'sillón' }} />);
    expect(screen.getByRole('button', { name: /Nueva sillón/i })).toBeInTheDocument();
  });
});
