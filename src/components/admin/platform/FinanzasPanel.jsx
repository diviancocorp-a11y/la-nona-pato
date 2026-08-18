/**
 * FinanzasPanel — la pestaña "Gastos" del panel del edificio. ETAPA 3.
 *
 * Es un contenedor, no una pantalla: las tres que muestra (Gastos, Compra,
 * Proveedores) son las del admin legacy, reusadas con los savers inyectados.
 * Existe por una razón de navegación: el panel del edificio tiene barra
 * inferior y nada más. Sumar tres pestañas dejaba seis ítems en una barra que
 * se usa con el pulgar; acá entran como un solo destino con tres solapas.
 *
 * Por qué las tres juntas y no repartidas: son el mismo momento del día. Se
 * carga una compra, se ve cuánto salió, y si el proveedor no estaba se crea
 * ahí. Separarlas obligaría a saltar de pestaña en el medio de una carga.
 *
 * OJO: `Suppliers` va con `asPage` — su root normal es `.ag-page-over`, que
 * esconde el topbar y el bottom nav mientras existe en el DOM.
 */
import { useState } from 'react';
import { Expenses, Purchase } from '../Finance';
import Suppliers from '../Suppliers';

const SOLAPAS = [
  { id: 'gastos', label: 'Gastos' },
  { id: 'compra', label: 'Compra' },
  { id: 'proveedores', label: 'Proveedores' },
];

function Solapas({ valor, onChange, opciones }) {
  return (
    <div style={{ display: 'flex', gap: 6, padding: '12px 16px 0' }}>
      {opciones.map(o => {
        const on = valor === o.id;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            aria-current={on ? 'page' : undefined}
            style={{
              flex: 1, padding: '9px 6px', borderRadius: 999,
              border: on ? '2px solid var(--ag-c-terra)' : '1px solid var(--ag-line)',
              background: on ? 'rgba(245,158,11,0.08)' : 'var(--ag-bg-card)',
              color: on ? 'var(--ag-c-terra)' : 'var(--ag-ink-2)',
              fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
            }}
          >{o.label}</button>
        );
      })}
    </div>
  );
}

export default function FinanzasPanel({
  expenses, setExpenses,
  ingredients, setIngredients,
  settings, user, showToast, recargar,
  // Capacidades por rubro. Una barbería no ingresa mercadería ni clasifica
  // gastos con el plan de cuentas de un restaurante.
  permiteCompras = true,
  permiteUsar = true,
  // Savers del edificio
  onCrearGasto, onAnularGasto, onRegistrarCompra, onCrearInsumo,
  onFetchProveedores, onSaveProveedor, onToggleProveedor, onDeleteProveedor,
  // Sube la foto del ticket al bucket del tenant (migracion 0034).
  onSubirComprobante = null,
}) {
  const [solapa, setSolapa] = useState('gastos');
  const opciones = permiteCompras ? SOLAPAS : SOLAPAS.filter(s => s.id !== 'compra');

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
      <Solapas valor={solapa} onChange={setSolapa} opciones={opciones} />

      {solapa === 'gastos' && (
        <Expenses
          expenses={expenses}
          setExpenses={setExpenses}
          settings={settings || {}}
          user={user}
          showToast={showToast}
          permiteUsar={permiteUsar}
          onCreate={onCrearGasto}
          onVoid={onAnularGasto}
          onFetchSuppliers={onFetchProveedores}
          onSaveSupplier={onSaveProveedor}
        />
      )}

      {solapa === 'compra' && permiteCompras && (
        <Purchase
          ingredients={ingredients}
          setIngredients={setIngredients}
          setExpenses={setExpenses}
          settings={settings || {}}
          user={user}
          showToast={showToast}
          loadAll={recargar}
          onClose={() => setSolapa('gastos')}
          onRegistrar={onRegistrarCompra}
          onCrearInsumo={onCrearInsumo}
          onFetchSuppliers={onFetchProveedores}
          onSaveSupplier={onSaveProveedor}
          // Con el bucket del tenant (0034) la foto del ticket ya tiene dónde
          // ir: se enciende sólo si hay uploader inyectado.
          permiteComprobante={!!onSubirComprobante}
          onSubirComprobante={onSubirComprobante}
        />
      )}

      {solapa === 'proveedores' && (
        <Suppliers
          asPage
          showToast={showToast}
          onFetch={onFetchProveedores}
          onSave={onSaveProveedor}
          onToggle={onToggleProveedor}
          onDelete={onDeleteProveedor}
        />
      )}
    </div>
  );
}
