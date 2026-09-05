// El cobro de una cuenta (Etapa 6d).
//
// Lo que importa que sea cierto:
//   - que el monto venga cargado con lo que FALTA (el cobro de un toque);
//   - que lo que se asienta sea lo cobrado y NO lo que el cliente entrego,
//     porque registrar el billete entero descuadra el arqueo todos los dias;
//   - que un pago parcial deje la cuenta abierta y recargue el resto;
//   - que sin medios de pago se diga, en vez de mostrar un boton muerto.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PantallaDeCobro from '../components/admin/platform/PantallaDeCobro';
import * as caja from '../services/platformCaja';

vi.mock('../services/platformCaja', () => ({
  fetchMediosDePago: vi.fn(),
  saldoDelPedido: vi.fn(),
  fetchPagosDePedido: vi.fn(),
  cobrar: vi.fn(),
}));

const MEDIOS = [
  { id: 'm-efe', name: 'Efectivo', kind: 'cash' },
  { id: 'm-tar', name: 'Tarjeta', kind: 'card' },
];

const pedido = (over = {}) => ({
  id: 'o1', code: '104', customer_name: 'Vale', total: 6500, ...over,
});

function montar(props = {}) {
  return render(
    <PantallaDeCobro tenantId="t1" pedido={pedido()} {...props} />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  caja.fetchMediosDePago.mockResolvedValue(MEDIOS);
  caja.fetchPagosDePedido.mockResolvedValue([]);
  caja.saldoDelPedido.mockResolvedValue(6500);
  caja.cobrar.mockResolvedValue({ ok: true, pago: { id: 'p1' } });
});

describe('PantallaDeCobro — el camino de un toque', () => {
  it('carga el monto con lo que falta', async () => {
    montar();
    const monto = await screen.findByDisplayValue('6500');
    expect(monto).toBeInTheDocument();
  });

  it('cobra el saldo completo con el medio elegido', async () => {
    montar();
    fireEvent.click(await screen.findByRole('button', { name: /Efectivo/ }));
    fireEvent.click(screen.getByRole('button', { name: /Cobrar \$/ }));
    await waitFor(() => expect(caja.cobrar).toHaveBeenCalledWith('t1', 'o1', 'm-efe', 6500));
  });

  it('con un solo medio no hace elegir', async () => {
    caja.fetchMediosDePago.mockResolvedValue([MEDIOS[0]]);
    montar();
    fireEvent.click(await screen.findByRole('button', { name: /Cobrar \$/ }));
    await waitFor(() => expect(caja.cobrar).toHaveBeenCalledWith('t1', 'o1', 'm-efe', 6500));
  });
});

describe('PantallaDeCobro — el vuelto no se registra', () => {
  it('calcula el vuelto pero cobra el monto de la cuenta', async () => {
    montar();
    fireEvent.click(await screen.findByRole('button', { name: /Efectivo/ }));
    fireEvent.change(screen.getByPlaceholderText('Para calcular el vuelto'), {
      target: { value: '10000' },
    });
    expect(screen.getByText(/Vuelto/)).toBeInTheDocument();
    expect(screen.getByText(/3\.?500/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Cobrar \$/ }));
    // 6500, no 10000: lo entregado nunca sale de la pantalla.
    await waitFor(() => expect(caja.cobrar).toHaveBeenCalledWith('t1', 'o1', 'm-efe', 6500));
  });

  it('avisa cuando lo entregado no alcanza', async () => {
    montar();
    fireEvent.click(await screen.findByRole('button', { name: /Efectivo/ }));
    fireEvent.change(screen.getByPlaceholderText('Para calcular el vuelto'), {
      target: { value: '5000' },
    });
    expect(screen.getByText(/Faltan/)).toBeInTheDocument();
  });

  it('el campo de vuelto solo aparece en efectivo', async () => {
    montar();
    fireEvent.click(await screen.findByRole('button', { name: /Tarjeta/ }));
    expect(screen.queryByPlaceholderText('Para calcular el vuelto')).not.toBeInTheDocument();
  });
});

describe('PantallaDeCobro — cuenta dividida', () => {
  it('un pago parcial deja el resto cargado y la cuenta abierta', async () => {
    montar();
    fireEvent.click(await screen.findByRole('button', { name: /Efectivo/ }));
    fireEvent.change(screen.getByDisplayValue('6500'), { target: { value: '4000' } });

    caja.fetchPagosDePedido.mockResolvedValue([
      { id: 'p1', method_id: 'm-efe', amount: 4000 },
    ]);
    caja.saldoDelPedido.mockResolvedValue(2500);

    fireEvent.click(screen.getByRole('button', { name: /Cobrar \$/ }));
    await waitFor(() => expect(caja.cobrar).toHaveBeenCalledWith('t1', 'o1', 'm-efe', 4000));
    // El siguiente cobro arranca con lo que quedo.
    expect(await screen.findByDisplayValue('2500')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cerrar la cuenta' })).not.toBeInTheDocument();
  });

  it('saldada, ofrece cerrar la cuenta y no el cobro', async () => {
    caja.saldoDelPedido.mockResolvedValue(0);
    caja.fetchPagosDePedido.mockResolvedValue([
      { id: 'p1', method_id: 'm-tar', amount: 6500 },
    ]);
    const onCompletar = vi.fn();
    const onCerrar = vi.fn();
    montar({ onCompletar, onCerrar });

    fireEvent.click(await screen.findByRole('button', { name: 'Cerrar la cuenta' }));
    expect(onCompletar).toHaveBeenCalledWith(expect.objectContaining({ id: 'o1' }));
    expect(onCerrar).toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /Cobrar \$/ })).not.toBeInTheDocument();
  });
});

describe('PantallaDeCobro — lo que puede salir mal se dice', () => {
  it('sin medios de pago no muestra un boton muerto', async () => {
    caja.fetchMediosDePago.mockResolvedValue([]);
    montar();
    expect(await screen.findByText(/no tiene medios de pago cargados/)).toBeInTheDocument();
  });

  it('avisa que el cobro no entra en ningun arqueo si la caja esta cerrada', async () => {
    montar({ hayTurnoAbierto: false });
    expect(await screen.findByText(/no va a\s+entrar en el arqueo/)).toBeInTheDocument();
  });

  it('muestra el error de la base sin cerrar la pantalla', async () => {
    caja.cobrar.mockResolvedValue({ __error: 'db', message: 'El monto tiene que ser mayor a cero.' });
    montar();
    fireEvent.click(await screen.findByRole('button', { name: /Efectivo/ }));
    fireEvent.click(screen.getByRole('button', { name: /Cobrar \$/ }));
    expect(await screen.findByText('El monto tiene que ser mayor a cero.')).toBeInTheDocument();
  });

  // P0-2 del smoke del 4/9/2026: se pudo cobrar $58.000 sobre un pedido de
  // $29.000. El tope de verdad esta en `register_payment` (0063); esto mide
  // que la pantalla no lo deje ni intentar.
  it('no deja cobrar mas que el saldo', async () => {
    montar();
    const monto = await screen.findByDisplayValue('6500');
    fireEvent.click(screen.getByRole('button', { name: /Efectivo/ }));
    fireEvent.change(monto, { target: { value: '9000' } });
    expect(await screen.findByText(/No se puede cobrar más que lo que falta/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Cobrar \$/ }));
    expect(caja.cobrar).not.toHaveBeenCalled();
  });

  it('cobra un parcial sin protestar', async () => {
    montar();
    const monto = await screen.findByDisplayValue('6500');
    fireEvent.click(screen.getByRole('button', { name: /Efectivo/ }));
    fireEvent.change(monto, { target: { value: '3000' } });
    fireEvent.click(screen.getByRole('button', { name: /Cobrar \$/ }));
    await waitFor(() => expect(caja.cobrar).toHaveBeenCalledWith('t1', 'o1', 'm-efe', 3000));
  });

  it('no cobra sin medio elegido', async () => {
    montar();
    await screen.findByDisplayValue('6500');
    fireEvent.click(screen.getByRole('button', { name: /Cobrar \$/ }));
    expect(caja.cobrar).not.toHaveBeenCalled();
  });
});
