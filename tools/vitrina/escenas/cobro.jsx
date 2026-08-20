// Cobrar una cuenta de $6.500, con tres medios y la caja abierta.
import PantallaDeCobro from 'app/components/admin/platform/PantallaDeCobro.jsx';
import { filasDe } from '../fake-supabase.js';

const PEDIDO = { id: 'o1', code: '104', customer_name: 'Vale · Mesa 3', total: 6500 };

export default {
  titulo: 'Cobro de una cuenta',
  componente: PantallaDeCobro,
  props: {
    tenantId: 't1',
    pedido: PEDIDO,
    hayTurnoAbierto: true,
    onCerrar: () => {},
    onCobrado: () => {},
    onCompletar: () => {},
  },
  datos: {
    tablas: {
      payment_methods: [
        { id: 'm-efe', tenant_id: 't1', name: 'Efectivo', kind: 'cash', active: true },
        { id: 'm-tar', tenant_id: 't1', name: 'Tarjeta', kind: 'card', active: true },
        { id: 'm-mp', tenant_id: 't1', name: 'MercadoPago', kind: 'mp', active: true },
      ],
      payments: [],
    },
    rpc: {
      order_balance: () => (
        PEDIDO.total - filasDe('payments').reduce((a, p) => a + Number(p.amount), 0)
      ),
      register_payment: (args) => {
        const pago = {
          id: `p${filasDe('payments').length + 1}`,
          tenant_id: args.p_tenant_id,
          order_id: args.p_order_id,
          method_id: args.p_method_id,
          amount: args.p_amount,
          paid_at: new Date().toISOString(),
        };
        filasDe('payments').push(pago);
        return pago;
      },
    },
  },
};
