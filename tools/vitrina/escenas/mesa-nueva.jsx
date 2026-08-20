// El alta de una mesa, con dos zonas ya existentes y el borrador que arma el
// panel al tocar el plano (nombre siguiente, forma y capacidad heredadas).
import EditorDeMesa from 'app/components/admin/platform/EditorDeMesa.jsx';

export default {
  titulo: 'Alta de una mesa',
  componente: EditorDeMesa,
  props: {
    recurso: {
      kind: 'table', name: '6', capacity: 4, shape: 'round',
      zone: 'Patio', pos_x: 42.5, pos_y: 61,
    },
    zonas: ['Adentro', 'Patio'],
    terminologia: { plural: 'Mesas', singular: 'mesa' },
    onGuardar: async () => ({ ok: true }),
    onArchivar: async () => true,
    onCerrar: () => {},
  },
};
