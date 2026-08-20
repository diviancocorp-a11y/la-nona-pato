// Lo que Dico ve cuando hay plata yéndose sin que nadie mire (6g).
//
// Los datos estan armados para disparar varias reglas a la vez y ver como
// compiten por el tope: gana la que mas plata mueve.
import DicoOportunidades from 'app/components/admin/platform/DicoOportunidades.jsx';

const hace = (d) => new Date(Date.now() - d * 86400000).toISOString();

const venta = (over = {}) => ({
  recipe_id: 'p1', qty: 1, unit_price: 1000, unit_cost: 400,
  date: hace(20), ...over,
});

export default {
  titulo: 'Oportunidades de Dico',
  componente: DicoOportunidades,
  props: {
    vertical: 'gastro',
    productos: [
      { id: 'p1', name: 'Milanesa napolitana', active: true },
      { id: 'p2', name: 'Ensalada césar', active: true },
      { id: 'p3', name: 'Flan casero', active: true },
      { id: 'p4', name: 'Gaseosa', active: true },
    ],
    ventas: [
      ...Array.from({ length: 8 }, (_, i) => venta({ date: hace(60 - i * 7) })),
      ...Array.from({ length: 4 }, (_, i) => venta({ recipe_id: 'p2', date: hace(50 - i * 8) })),
      // Vende mucho y deja poco: 10% contra el 60% del resto.
      ...Array.from({ length: 22 }, (_, i) => venta({
        recipe_id: 'p4', unit_price: 1200, unit_cost: 1080, date: hace(45 - i),
      })),
    ],
    insumos: [
      { name: 'Harina 000', stock: 300, cost: 900 },
      { name: 'Aceite', stock: 80, cost: 2400 },
      { name: 'Sal fina', stock: 20, cost: 300 },
    ],
    clientes: [
      { name: 'Vale Gómez', orders: 7, total: 84000, first_order: hace(140), last_order: hace(95) },
      { name: 'Ana Ruiz', orders: 5, total: 30000, first_order: hace(100), last_order: hace(6) },
      { name: 'Leo Paz', orders: 4, total: 21000, first_order: hace(90), last_order: hace(9) },
      { name: 'Sol Díaz', orders: 3, total: 12000, first_order: hace(60), last_order: hace(7) },
    ],
    utilizacion: { utilizacion_pct: 34, horas_disponibles: 48, horas_vendidas: 16 },
    esperaPerdida: [
      { status: 'left', party_size: 4, created_at: hace(20) },
      { status: 'left', party_size: 2, created_at: hace(12) },
      { status: 'left', party_size: 3, created_at: hace(5) },
    ],
    onIr: (tab) => console.log('ir a', tab),
  },
};
