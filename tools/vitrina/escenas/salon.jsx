// El plano del salon con dos zonas, y el alta enganchada como en el panel.
//
// La escena tiene ESTADO a proposito: el mapa y el editor por separado ya los
// cubren los tests: lo que no cubre nadie es que tocar el plano abra el editor
// con la zona correcta y que la mesa aparezca donde se toco. Ahi es donde
// estan los bugs de integracion.
import { useState } from 'react';
import MapaDeMesas from 'app/components/admin/platform/MapaDeMesas.jsx';
import EditorDeMesa from 'app/components/admin/platform/EditorDeMesa.jsx';
import { siguienteNombre } from 'app/services/platformScheduling.js';

const mesa = (id, name, zone, pos_x, pos_y, capacity, shape, over = {}) => ({
  id, name, zone, pos_x, pos_y, capacity, shape,
  kind: 'table', active: true, ...over,
});

const INICIALES = [
  mesa('r1', '1', 'Adentro', 20, 25, 4, 'square'),
  mesa('r2', '2', 'Adentro', 50, 25, 2, 'round'),
  mesa('r3', '3', 'Adentro', 80, 25, 6, 'rect', { width: 96 }),
  mesa('r4', '4', 'Patio', 25, 40, 4, 'round'),
  mesa('r5', '5', 'Patio', 60, 55, 8, 'rect', { width: 110, combinable: true }),
  // Sin pos: cae en la bandeja de "todavia no estan en el plano".
  mesa('r6', '6', 'Patio', null, null, 2, 'round'),
];

const TERMINOS = { plural: 'Mesas', singular: 'mesa' };

function Salon() {
  const [recursos, setRecursos] = useState(INICIALES);
  const [enEdicion, setEnEdicion] = useState(null);

  const nueva = (semilla = {}) => {
    const ultima = recursos[recursos.length - 1];
    setEnEdicion({
      kind: 'table',
      name: siguienteNombre(recursos),
      capacity: ultima?.capacity || 4,
      shape: ultima?.shape || 'round',
      ...semilla,
    });
  };

  const guardar = async (datos) => {
    setRecursos(prev => (datos.id
      ? prev.map(r => (r.id === datos.id ? { ...r, ...datos } : r))
      : [...prev, { ...datos, id: `n${prev.length + 1}`, active: true }]));
    return { ok: true };
  };

  const archivar = async (id) => {
    setRecursos(prev => prev.filter(r => r.id !== id));
    return true;
  };

  return (
    <>
      <MapaDeMesas
        recursos={recursos}
        reservas={[
          { id: 'a1', resource_id: 'r2', status: 'confirmed' },
          { id: 'a2', resource_id: 'r5', status: 'in_service' },
        ]}
        utilizacion={{ utilizacion_pct: 62, horas_disponibles: 48, horas_vendidas: 30 }}
        onMover={async (id, pos) => {
          setRecursos(prev => prev.map(r => (r.id === id ? { ...r, ...pos } : r)));
          return true;
        }}
        onSeleccionar={setEnEdicion}
        onNuevo={nueva}
        terminologia={TERMINOS}
      />
      {enEdicion && (
        <EditorDeMesa
          recurso={enEdicion}
          zonas={[...new Set(recursos.map(r => r.zone).filter(Boolean))]}
          terminologia={TERMINOS}
          onGuardar={guardar}
          onArchivar={archivar}
          onCerrar={() => setEnEdicion(null)}
        />
      )}
    </>
  );
}

export default {
  titulo: 'Plano del salon (con alta)',
  componente: Salon,
  props: {},
};
