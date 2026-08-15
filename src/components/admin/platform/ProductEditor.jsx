/**
 * ProductEditor — alta y edicion de un producto del edificio.
 *
 * Que campos se muestran y como se llaman las cosas lo decide el registry de
 * rubros (src/modules/registry.js), no este archivo: aca no hay ningun
 * `vertical === 'barber'`. Una barberia carga duracion, una tienda carga
 * stock, y ninguna de las dos ve campos que no le sirven.
 */
import { useState } from 'react';
import ToggleSwitch from '../shared/forms/ToggleSwitch';
import { validateProduct } from '../../../services/platformAdmin';
import { usaCampo, terminologia, tipoPorDefecto } from '../../../modules/registry';

const EMPTY = {
  name: '', price: '', category: '', description: '', image_url: '',
  active: true, requires_age_gate: false, duration_min: '', stock: '',
};

const lbl = { display: 'block', fontSize: 12, color: 'var(--ag-ink-3)', marginBottom: 5 };
const input = {
  width: '100%', padding: '10px 12px', fontSize: 14, fontFamily: 'inherit',
  color: 'var(--ag-ink)', background: 'var(--ag-bg-card)',
  border: '1px solid var(--ag-line)', borderRadius: 'var(--ag-r-md, 10px)',
  outline: 'none', boxSizing: 'border-box',
};
const row = { marginBottom: 14 };

export default function ProductEditor({ product, vertical, categories = [], onSave, onCancel }) {
  const [form, setForm] = useState(() => ({
    ...EMPTY,
    ...(product || {}),
    price: product?.price ?? '',
    duration_min: product?.duration_min ?? '',
    stock: product?.stock ?? '',
    category: product?.category ?? '',
    description: product?.description ?? '',
    image_url: product?.image_url ?? '',
  }));
  const [errs, setErrs] = useState([]);
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const t = terminologia(vertical);
  const usaDuracion = usaCampo(vertical, 'duration_min');
  const usaStock = usaCampo(vertical, 'stock');
  const usaEdad = usaCampo(vertical, 'requires_age_gate');

  const submit = async (e) => {
    e.preventDefault();
    const problems = validateProduct(form);
    if (problems.length) { setErrs(problems); return; }
    setErrs([]);
    setSaving(true);
    await onSave({ ...form, type: product?.type || tipoPorDefecto(vertical) });
    setSaving(false);
  };

  return (
    <form onSubmit={submit} style={{ padding: '4px 2px 20px' }}>
      {errs.length > 0 && (
        <div style={{
          padding: '10px 12px', marginBottom: 14, borderRadius: 10,
          background: 'var(--ag-c-orders-soft, #FFEBEE)', color: 'var(--ag-c-orders, #C62828)',
          fontSize: 13,
        }} role="alert">
          {errs.join('. ')}
        </div>
      )}

      <div style={row}>
        <label style={lbl} htmlFor="pe-name">Nombre</label>
        <input
          id="pe-name" style={input} type="text" value={form.name}
          onChange={e => set('name', e.target.value)}
          placeholder={t.ejemplo}
          autoFocus
        />
      </div>

      <div style={{ ...row, display: 'flex', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <label style={lbl} htmlFor="pe-price">Precio</label>
          <input
            id="pe-price" style={input} type="number" inputMode="decimal" min="0" step="0.01"
            value={form.price} onChange={e => set('price', e.target.value)} placeholder="0"
          />
        </div>
        {usaDuracion && (
          <div style={{ flex: 1 }}>
            <label style={lbl} htmlFor="pe-dur">Duración (min)</label>
            <input
              id="pe-dur" style={input} type="number" inputMode="numeric" min="1" step="5"
              value={form.duration_min} onChange={e => set('duration_min', e.target.value)} placeholder="30"
            />
          </div>
        )}
        {usaStock && (
          <div style={{ flex: 1 }}>
            <label style={lbl} htmlFor="pe-stock">Stock</label>
            <input
              id="pe-stock" style={input} type="number" inputMode="numeric" min="0" step="1"
              value={form.stock} onChange={e => set('stock', e.target.value)} placeholder="0"
            />
          </div>
        )}
      </div>

      <div style={row}>
        <label style={lbl} htmlFor="pe-cat">Categoría</label>
        <input
          id="pe-cat" style={input} type="text" list="pe-cats" value={form.category}
          onChange={e => set('category', e.target.value)}
          placeholder={t.ejemploCategoria}
        />
        <datalist id="pe-cats">
          {categories.map(c => <option key={c} value={c} />)}
        </datalist>
        <div style={{ fontSize: 11, color: 'var(--ag-ink-3)', marginTop: 5 }}>
          Agrupa el catalogo. Si escribis una nueva, se crea sola.
        </div>
      </div>

      <div style={row}>
        <label style={lbl} htmlFor="pe-desc">Descripcion</label>
        <textarea
          id="pe-desc" style={{ ...input, minHeight: 72, resize: 'vertical' }}
          value={form.description} onChange={e => set('description', e.target.value)}
          placeholder="Que lleva, como viene..."
        />
      </div>

      <div style={row}>
        <label style={lbl} htmlFor="pe-img">Imagen (URL)</label>
        <input
          id="pe-img" style={input} type="url" value={form.image_url}
          onChange={e => set('image_url', e.target.value)} placeholder="https://..."
        />
      </div>

      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 0', borderTop: '1px solid var(--ag-line)',
      }}>
        <div>
          <div style={{ fontSize: 14, color: 'var(--ag-ink)' }}>Visible en el catalogo</div>
          <div style={{ fontSize: 11, color: 'var(--ag-ink-3)' }}>Si lo apagas, nadie lo ve ni lo puede pedir</div>
        </div>
        <ToggleSwitch checked={form.active !== false} onChange={v => set('active', v)} label="Visible en el catalogo" />
      </div>

      {usaEdad && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 0', borderTop: '1px solid var(--ag-line)',
        }}>
          <div>
            <div style={{ fontSize: 14, color: 'var(--ag-ink)' }}>Requiere +18</div>
            <div style={{ fontSize: 11, color: 'var(--ag-ink-3)' }}>Pide confirmación de edad antes de mostrarlo</div>
          </div>
          <ToggleSwitch checked={!!form.requires_age_gate} onChange={v => set('requires_age_gate', v)} label="Requiere +18" />
        </div>
      )}

      <div style={{ height: 18 }} />

      <div style={{ display: 'flex', gap: 10 }}>
        <button type="button" className="ag-btn-ghost" onClick={onCancel} style={{ flex: 1 }} disabled={saving}>
          Cancelar
        </button>
        <button type="submit" className="ag-btn-primary" style={{ flex: 1 }} disabled={saving}>
          {saving ? 'Guardando...' : 'Guardar'}
        </button>
      </div>
    </form>
  );
}
