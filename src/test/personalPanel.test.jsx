// El equipo hoy (Etapa 6e).
//
// Lo que tiene que ser cierto para un encargado que abre esto a las 14:00:
// saber quien esta adentro, hace cuanto, si el fichaje prueba algo, y cuanto
// le esta costando el turno contra lo que vendio.

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import PersonalPanel from '../components/admin/platform/PersonalPanel';

const persona = (over = {}) => ({ id: 'p1', name: 'Ana', job: 'barbero', ...over });
const fichaje = (over = {}) => ({
  id: 'f1', staff_id: 'p1', method: 'webauthn',
  clock_in_at: new Date(Date.now() - 90 * 60000).toISOString(), ...over,
});

describe('PersonalPanel', () => {
  it('separa quien esta adentro de quien no', () => {
    render(<PersonalPanel
      personal={[persona(), persona({ id: 'p2', name: 'Beto' })]}
      fichajesAbiertos={[fichaje()]}
    />);
    expect(screen.getByText('Trabajando ahora (1)')).toBeInTheDocument();
    expect(screen.getByText('Fuera de turno (1)')).toBeInTheDocument();
  });

  it('dice hace cuanto entro, no un timestamp', () => {
    // Un horario obliga a hacer la resta mentalmente en medio del servicio.
    render(<PersonalPanel personal={[persona()]} fichajesAbiertos={[fichaje()]} />);
    expect(screen.getByText(/entró hace 1 h 30 min/)).toBeInTheDocument();
  });

  it('distingue como se verifico el fichaje', () => {
    // `manual` no prueba nada: mostrarlo igual que una passkey seria mentir
    // sobre el dato.
    const { rerender } = render(
      <PersonalPanel personal={[persona()]} fichajesAbiertos={[fichaje({ method: 'webauthn' })]} />);
    expect(screen.getByText('Verificado')).toBeInTheDocument();

    rerender(
      <PersonalPanel personal={[persona()]} fichajesAbiertos={[fichaje({ method: 'manual' })]} />);
    expect(screen.getByText('Cargado a mano')).toBeInTheDocument();
  });

  it('el boton cambia segun donde esta la persona', () => {
    const onFichar = vi.fn();
    render(<PersonalPanel
      personal={[persona(), persona({ id: 'p2', name: 'Beto' })]}
      fichajesAbiertos={[fichaje()]}
      onFichar={onFichar}
    />);

    fireEvent.click(screen.getByRole('button', { name: 'Marcar salida' }));
    expect(onFichar).toHaveBeenCalledWith('p1', true);

    fireEvent.click(screen.getByRole('button', { name: 'Marcar entrada' }));
    expect(onFichar).toHaveBeenCalledWith('p2', false);
  });

  it('muestra el costo CONTRA la venta, no solo el monto', () => {
    // "$24.000 de personal" no dice nada. "12% de lo que vendiste" si, porque
    // se compara contra ayer y contra el objetivo.
    render(<PersonalPanel personal={[persona()]} costoLaboral={{
      horas_trabajadas: 8, costo_laboral: 24000, ventas: 200000,
      costo_sobre_ventas_pct: 12,
    }} />);
    expect(screen.getByText('12%')).toBeInTheDocument();
    expect(screen.getByText(/8.0 h trabajadas/)).toBeInTheDocument();
    expect(screen.getByText(/sobre .*200/)).toBeInTheDocument();
  });

  it('sin ventas todavia no inventa un porcentaje', () => {
    // Poner 0 o 100 seria inventar. Se dice que falta el dato.
    render(<PersonalPanel personal={[persona()]} costoLaboral={{
      horas_trabajadas: 3, costo_laboral: 9000, ventas: 0,
      costo_sobre_ventas_pct: null,
    }} />);
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.getByText(/todavía sin ventas cargadas hoy/)).toBeInTheDocument();
  });

  it('sin nadie fichado lo dice, no deja la seccion vacia', () => {
    render(<PersonalPanel personal={[persona()]} fichajesAbiertos={[]} />);
    expect(screen.getByText('No hay nadie fichado.')).toBeInTheDocument();
  });

  it('sin equipo cargado explica que falta', () => {
    render(<PersonalPanel personal={[]} />);
    expect(screen.getByText(/Todavía no cargaste a nadie/)).toBeInTheDocument();
  });

  it('el estado no depende solo del color del punto', () => {
    // El punto verde se lee de lejos, pero el texto tiene que alcanzar solo.
    render(<PersonalPanel personal={[persona()]} fichajesAbiertos={[fichaje()]} />);
    expect(screen.getByText(/barbero · entró hace/)).toBeInTheDocument();
  });
});
