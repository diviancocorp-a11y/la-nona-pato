// El turno de caja (Etapa 6d).
//
// Lo que importa que sea cierto: que el faltante se vea, que no se pueda
// cerrar por accidente, y que el conteo de ayer no quede en pantalla para el
// turno de hoy.

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CajaPanel from '../components/admin/platform/CajaPanel';

const turno = (over = {}) => ({
  id: 't1', opening_amount: 5000, opened_at: '2026-08-19T13:00:00Z',
  business_day: '2026-08-19', status: 'open', ...over,
});

describe('CajaPanel — sin turno', () => {
  it('pide la apertura y explica que poner', () => {
    render(<CajaPanel turno={null} esperado={0} />);
    expect(screen.getByText('CAJA CERRADA')).toBeInTheDocument();
    expect(screen.getByText(/¿Con cuánto arrancás\?/)).toBeInTheDocument();
    expect(screen.getByText(/Si no dejás nada, poné 0/)).toBeInTheDocument();
  });

  it('abre con el monto tipeado', () => {
    const onAbrir = vi.fn();
    render(<CajaPanel turno={null} esperado={0} onAbrir={onAbrir} />);
    fireEvent.change(screen.getByPlaceholderText('0'), { target: { value: '5000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Abrir caja' }));
    expect(onAbrir).toHaveBeenCalledWith(5000, null);
  });

  it('el campo no acepta letras', () => {
    render(<CajaPanel turno={null} esperado={0} onAbrir={vi.fn()} />);
    const input = screen.getByPlaceholderText('0');
    fireEvent.change(input, { target: { value: '12a3b' } });
    expect(input.value).toBe('123');
  });

  it('muestra los arqueos previos y marca el que no cerro justo', () => {
    render(<CajaPanel turno={null} esperado={0} turnosPrevios={[
      { id: 'a', business_day: '2026-08-18', difference: 0, status: 'closed' },
      { id: 'b', business_day: '2026-08-17', difference: -200, status: 'closed' },
    ]} />);
    expect(screen.getByText('cerró justo')).toBeInTheDocument();
    expect(screen.getByText(/-\s?\$?\s?200/)).toBeInTheDocument();
  });
});

describe('CajaPanel — turno abierto', () => {
  it('desglosa la apertura y lo cobrado en efectivo', () => {
    // Solo efectivo: lo de tarjeta no esta en el cajon y sumarlo haria que el
    // arqueo diera mal siempre.
    render(<CajaPanel turno={turno()} esperado={12000} />);
    expect(screen.getByText('Apertura')).toBeInTheDocument();
    expect(screen.getByText('Cobrado en efectivo')).toBeInTheDocument();
    expect(screen.getByText('Debería haber')).toBeInTheDocument();
  });

  it('el faltante se muestra, no se esconde', () => {
    render(<CajaPanel turno={turno()} esperado={13000} onCerrar={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText('0'), { target: { value: '12800' } });
    expect(screen.getByText('Falta')).toBeInTheDocument();
  });

  it('un sobrante tambien se marca', () => {
    render(<CajaPanel turno={turno()} esperado={13000} onCerrar={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText('0'), { target: { value: '13500' } });
    expect(screen.getByText('Sobra')).toBeInTheDocument();
  });

  it('cuando coincide, lo dice', () => {
    render(<CajaPanel turno={turno()} esperado={13000} onCerrar={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText('0'), { target: { value: '13000' } });
    expect(screen.getByText('Cierra justo')).toBeInTheDocument();
  });

  it('pregunta el motivo solo cuando hay diferencia', () => {
    render(<CajaPanel turno={turno()} esperado={13000} onCerrar={vi.fn()} />);
    expect(screen.queryByText(/¿Sabés por qué\?/)).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('0'), { target: { value: '12800' } });
    expect(screen.getByText(/¿Sabés por qué\?/)).toBeInTheDocument();
  });

  it('no se puede cerrar sin contar', () => {
    render(<CajaPanel turno={turno()} esperado={13000} onCerrar={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Cerrar caja/ })).toBeDisabled();
  });

  it('cerrar pide confirmacion: no se termina el turno de un toque', () => {
    // Cerrar la caja no se deshace.
    const onCerrar = vi.fn();
    render(<CajaPanel turno={turno()} esperado={13000} onCerrar={onCerrar} />);
    fireEvent.change(screen.getByPlaceholderText('0'), { target: { value: '12800' } });

    fireEvent.click(screen.getByRole('button', { name: /Cerrar caja/ }));
    expect(onCerrar).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /¿Seguro\?/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /¿Seguro\?/ }));
    expect(onCerrar).toHaveBeenCalledWith(12800, null);
  });

  it('cambiar el conteo cancela la confirmacion pendiente', () => {
    const onCerrar = vi.fn();
    render(<CajaPanel turno={turno()} esperado={13000} onCerrar={onCerrar} />);
    const input = screen.getByPlaceholderText('0');

    fireEvent.change(input, { target: { value: '12800' } });
    fireEvent.click(screen.getByRole('button', { name: /Cerrar caja/ }));
    fireEvent.change(input, { target: { value: '13000' } });

    // Vuelve a "Cerrar caja": si quedara armado, corregir el conteo cerraria
    // la caja con el numero equivocado.
    expect(screen.getByRole('button', { name: /Cerrar caja/ })).toBeInTheDocument();
    expect(onCerrar).not.toHaveBeenCalled();
  });

  it('el motivo viaja con el cierre', () => {
    const onCerrar = vi.fn();
    render(<CajaPanel turno={turno()} esperado={13000} onCerrar={onCerrar} />);
    fireEvent.change(screen.getByPlaceholderText('0'), { target: { value: '12800' } });
    fireEvent.change(screen.getByPlaceholderText(/Se pagó un flete/), {
      target: { value: 'se pagó un flete' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Cerrar caja/ }));
    fireEvent.click(screen.getByRole('button', { name: /¿Seguro\?/ }));
    expect(onCerrar).toHaveBeenCalledWith(12800, 'se pagó un flete');
  });

  it('al cambiar de turno se limpia el conteo anterior', () => {
    // Dejar el numero de ayer en pantalla es la forma mas facil de cerrar el
    // turno de hoy con el conteo equivocado.
    const { rerender } = render(<CajaPanel turno={turno()} esperado={13000} onCerrar={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText('0'), { target: { value: '12800' } });

    rerender(<CajaPanel turno={turno({ id: 't2' })} esperado={0} onCerrar={vi.fn()} />);
    expect(screen.getByPlaceholderText('0').value).toBe('');
  });
});
