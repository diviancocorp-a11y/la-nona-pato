// Los mismos pedidos, vistos por la COCINA: sin importes ni cobro (6f).
//
// Cambiar `roles` a ['manager'] en esta escena y recargar muestra la misma
// pantalla con los numeros: es la forma mas rapida de ver el recorte.
import OrdersPanel from 'app/components/admin/platform/OrdersPanel.jsx';
import ConfirmSlideProvider from 'app/components/ConfirmSlideProvider.jsx';

const PEDIDOS = [
  {
    id: 'o1', code: '104', customer_name: 'Vale', total: 6500, status: 'preparing',
    delivery: 'retiro', payment: 'efectivo', created_at: '2026-08-19T20:10:00Z',
  },
  {
    id: 'o2', code: '105', customer_name: 'Marcos', total: 3200, status: 'new',
    delivery: 'envio', payment: 'mercadopago', created_at: '2026-08-19T20:25:00Z',
    delivery_cost: 800, tip_amount: 300,
  },
];

function Cocina() {
  return (
    <ConfirmSlideProvider>
      <OrdersPanel
        orders={PEDIDOS}
        loading={false}
        roles={['kitchen']}
        tenantId="t1"
        onSetStatus={async () => ({})}
        showToast={() => {}}
      />
    </ConfirmSlideProvider>
  );
}

export default {
  titulo: 'Pedidos vistos por la cocina',
  componente: Cocina,
  props: {},
};
