// El legajo del empleado de Dico, lo primero que ve cuando entra.
//
// Empieza vacio a proposito: la pantalla interesante es la que le pide los
// datos, no la que ya los tiene. Cambiar LEGAJO por uno completo muestra la
// otra mitad.
import LegajoDeStaff from 'app/components/admin/platform/LegajoDeStaff.jsx';

const SESION = { user: { id: 'u-nuevo', email: 'camila.gonzalez@grupodivianco.com' } };

const LEGAJO = [];

export default {
  titulo: 'Legajo del empleado',
  componente: LegajoDeStaff,
  props: {
    email: 'camila.gonzalez@grupodivianco.com',
    puesto: 'Soporte',
    onListo: () => {},
    onSalir: () => {},
  },
  datos: {
    tablas: { staff_legajo: LEGAJO },
    sesion: SESION,
  },
};
