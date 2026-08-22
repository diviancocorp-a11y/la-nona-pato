// Los datos de incorporacion, lo primero que ve alguien que entra al equipo.
//
// Arranca vacio a proposito: la pantalla interesante es la que pide los datos.
// Cambiar el pais en el desplegable muestra como se adapta —el documento, como
// se llama la identificacion fiscal, que datos de cobro se piden— y elegir
// pasaporte hace desaparecer el dorso.
import LegajoDeStaff from 'app/components/admin/platform/LegajoDeStaff.jsx';

const SESION = { user: { id: 'u-nuevo', email: 'camila.gonzalez@grupodivianco.com' } };

export default {
  titulo: 'Incorporacion — en relacion de dependencia',
  componente: LegajoDeStaff,
  props: {
    email: 'camila.gonzalez@grupodivianco.com',
    puesto: 'Soporte',
    modalidad: 'empleado',
    onListo: () => {},
    onSalir: () => {},
  },
  datos: { tablas: { staff_legajo: [] }, sesion: SESION },
};
