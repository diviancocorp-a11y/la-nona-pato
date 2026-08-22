// La misma pantalla para alguien que FACTURA su servicio.
//
// Es la comparacion que importa: no hay seccion de domicilio ni telefono. De
// quien factura hace falta con que facturarle y a donde pagarle, y nada mas —
// pedirle el domicilio es pedir datos personales que la empresa no necesita y
// frenar un alta que deberia tomar dos minutos.
import LegajoDeStaff from 'app/components/admin/platform/LegajoDeStaff.jsx';

export default {
  titulo: 'Incorporacion — factura sus servicios',
  componente: LegajoDeStaff,
  props: {
    email: 'dev.remoto@grupodivianco.com',
    puesto: 'Soporte',
    modalidad: 'contratista',
    onListo: () => {},
    onSalir: () => {},
  },
  datos: {
    tablas: { staff_legajo: [] },
    sesion: { user: { id: 'u-freelance', email: 'dev.remoto@grupodivianco.com' } },
  },
};
