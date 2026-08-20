// El arqueo con un turno abierto y $37.500 esperados en el cajon.
import CajaPanel from 'app/components/admin/platform/CajaPanel.jsx';

export default {
  titulo: 'Arqueo de caja',
  componente: CajaPanel,
  props: {
    turno: {
      id: 't1', opening_amount: 5000, opened_at: '2026-08-19T13:00:00Z',
      business_day: '2026-08-19', status: 'open',
    },
    esperado: 37500,
    turnosPrevios: [
      { id: 'a', business_day: '2026-08-18', difference: 0, status: 'closed' },
      { id: 'b', business_day: '2026-08-17', difference: -200, status: 'closed' },
    ],
    onAbrir: async () => {},
    onCerrar: async () => {},
    onRefrescarEsperado: () => {},
  },
};
