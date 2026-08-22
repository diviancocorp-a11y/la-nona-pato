// La misma consola, vista por SOPORTE.
//
// Es la escena que importa mirar: los tests prueban la matriz de permisos,
// pero que la pantalla la USE es cableado, y el cableado no se ve en un test
// de un modulo puro. Acá tiene que pasar todo esto:
//   - no aparece la pestaña Equipo (repartir accesos es del dueño);
//   - los precios se ven y NO tienen botón de guardar;
//   - la suscripción de un negocio se ve y NO se puede mover;
//   - abre en Negocios, que es su pantalla.
import consola from './consola.jsx';

export default {
  ...consola,
  titulo: 'Consola vista por Soporte',
  datos: {
    ...consola.datos,
    // Martín es soporte y no es dueño. Lo demás de la escena no cambia: la
    // gracia es comparar las dos pantallas con los mismos datos.
    sesion: { user: { id: 'u3', email: 'martin@grupodivianco.com' } },
    tablas: {
      ...consola.datos.tablas,
      staff_legajo: [{ user_id: 'u3', nombre_completo: 'Martín K.', completado_at: '2026-08-20' }],
    },
  },
};
