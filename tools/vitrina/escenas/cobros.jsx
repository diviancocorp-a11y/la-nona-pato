// Conectar MercadoPago. Dos estados en una: sin conectar (el formulario con
// las instrucciones) y conectado en modo PRUEBA, que es el malentendido caro.
//
// Cambiar `CONECTADO` a false para ver el formulario de alta.
import CobrosOnline from 'app/components/admin/platform/CobrosOnline.jsx';

const CONECTADO = true;

const FUNCIONES = {
  'mp-status': async () => (
    CONECTADO
      ? {
        ok: true, conectado: true, cuenta: 'ELCOCHI',
        // En prueba a proposito: es el caso que el negocio tiene que entender
        // antes de creer que esta vendiendo.
        live_mode: false,
        firma_configurada: false,
        desde: '2026-08-19',
      }
      : { ok: true, conectado: false }
  ),

  'mp-connect': async (body) => {
    const t = String(body.access_token || '');
    if (!t.startsWith('APP_USR-') && !t.startsWith('TEST-')) {
      return {
        error: 'Ese token no es válido o fue revocado. Copialo de nuevo desde '
          + 'MercadoPago → Tus integraciones → Credenciales de producción.',
      };
    }
    return { ok: true, cuenta: { nickname: 'ELCOCHI', live_mode: true } };
  },
};

export default {
  titulo: 'Conectar MercadoPago',
  componente: CobrosOnline,
  props: {
    showToast: (m) => console.log('toast:', m),
    onBack: () => {},
  },
  datos: { functions: FUNCIONES },
};
