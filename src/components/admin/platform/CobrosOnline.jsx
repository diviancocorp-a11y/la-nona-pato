/**
 * CobrosOnline — conectar la cuenta de MercadoPago del negocio.
 *
 * ES LA PANTALLA QUE MAS PLATA MUEVE Y LA QUE MENOS SE MIRA
 * Se usa una vez y no se vuelve. Por eso no está optimizada para lo rápido
 * sino para lo que sale mal: qué token hay que copiar, de dónde, y qué pasa si
 * se pega el de prueba. Un negocio que conecta mal se entera con un cliente
 * esperando para pagar.
 *
 * EL TOKEN ENTRA Y NO VUELVE
 * El campo se limpia al guardar y la pantalla nunca lo muestra de nuevo: no
 * hay forma de pedirlo desde el front (RLS sin policies, migración 0051).
 * Cambiar la cuenta es pegar un token nuevo, no editar el que está.
 *
 * EL MODO PRUEBA SE DICE FUERTE
 * Los tokens `TEST-` funcionan y no cobran. Si el negocio no se entera, cree
 * que está vendiendo y no le entra un peso.
 */
import { useState, useEffect, useCallback } from 'react';
import { estadoMercadoPago, conectarMercadoPago } from '../../../services/platformPagos';

const campo = {
  width: '100%', padding: '11px 13px', borderRadius: 9, fontSize: 14,
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  background: 'var(--ag-surface-2, rgba(0,0,0,0.04))',
  border: '1px solid var(--ag-line)', color: 'inherit',
  boxSizing: 'border-box',
};

const etiqueta = { display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 };
const ayuda = { display: 'block', marginTop: 5, fontSize: 12.5, color: 'var(--ag-ink-3)' };

export default function CobrosOnline({ showToast, onBack }) {
  const [estado, setEstado] = useState(null);
  const [token, setToken] = useState('');
  const [publicKey, setPublicKey] = useState('');
  const [secreto, setSecreto] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);
  const [cambiando, setCambiando] = useState(false);

  const cargar = useCallback(async () => {
    setEstado(await estadoMercadoPago());
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const conectar = async () => {
    if (!token.trim()) return;
    setGuardando(true);
    setError(null);
    const r = await conectarMercadoPago({
      accessToken: token.trim(),
      publicKey: publicKey.trim(),
      webhookSecret: secreto.trim(),
    });
    setGuardando(false);
    if (r.__error) { setError(r.message); return; }
    // El token no queda en memoria ni un minuto más de lo necesario.
    setToken(''); setPublicKey(''); setSecreto('');
    setCambiando(false);
    showToast?.(r.aviso || `Conectado a ${r.cuenta?.nickname || 'MercadoPago'}`);
    cargar();
  };

  const conectado = estado?.conectado;
  const mostrarForm = !conectado || cambiando;

  return (
    <div style={{ padding: '12px 16px 24px', position: 'relative', zIndex: 2 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        {onBack && (
          <button
            type="button" onClick={onBack} aria-label="Volver"
            style={{
              border: 'none', background: 'transparent', font: 'inherit',
              fontSize: 20, cursor: 'pointer', color: 'inherit', padding: 0,
            }}
          >{'‹'}</button>
        )}
        <h2 style={{
          fontFamily: "'DM Sans', sans-serif", fontWeight: 800, fontSize: 18,
          margin: 0, color: 'var(--ag-ink)', letterSpacing: '-0.01em',
        }}>Cobros online</h2>
      </div>

      {estado === null && (
        <p style={{ fontSize: 13, color: 'var(--ag-ink-3)' }}>Cargando...</p>
      )}

      {conectado && (
        <div className="ag-card" style={{ padding: '14px 15px', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <span style={{
              width: 9, height: 9, borderRadius: 999,
              background: estado.live_mode ? 'var(--ag-ok, #2e7d32)' : 'var(--ag-warn, #ef6c00)',
            }} />
            <strong style={{ fontSize: 14 }}>
              {estado.live_mode ? 'Cobrando con MercadoPago' : 'Conectado en modo prueba'}
            </strong>
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--ag-ink-3)', marginTop: 6 }}>
            Cuenta: {estado.cuenta || 'sin nombre'}
          </div>

          {!estado.live_mode && (
            <div style={{
              marginTop: 10, padding: '9px 11px', borderRadius: 8, fontSize: 12.5,
              background: 'var(--ag-warn-bg, #FFF3E0)', color: 'var(--ag-warn, #B15A00)',
            }}>
              Pegaste un token de prueba: los pagos <strong>no son reales</strong> y
              esa plata no te entra. Para cobrar de verdad, pegá el token de
              producción.
            </div>
          )}

          {!estado.firma_configurada && (
            <div style={{
              marginTop: 10, padding: '9px 11px', borderRadius: 8, fontSize: 12.5,
              background: 'var(--ag-surface-2, rgba(0,0,0,0.04))', color: 'var(--ag-ink-3)',
            }}>
              No configuraste la firma del webhook. Funciona igual, pero con ella
              podemos verificar que los avisos de pago vienen de MercadoPago.
            </div>
          )}

          {!cambiando && (
            <button
              type="button" className="ag-btn-ghost"
              style={{ marginTop: 12 }}
              onClick={() => setCambiando(true)}
            >
              Cambiar de cuenta
            </button>
          )}
        </div>
      )}

      {mostrarForm && (
        <div className="ag-card" style={{ padding: '15px', display: 'grid', gap: 14 }}>
          <div>
            <strong style={{ fontSize: 14, display: 'block', marginBottom: 6 }}>
              Dónde buscar el token
            </strong>
            <ol style={{
              margin: 0, paddingLeft: 18, fontSize: 12.5,
              color: 'var(--ag-ink-3)', lineHeight: 1.6,
            }}>
              <li>Entrá a mercadopago.com.ar con la cuenta del negocio</li>
              <li>Andá a <strong>Tus integraciones</strong> y abrí tu aplicación</li>
              <li>En <strong>Credenciales de producción</strong>, copiá el
                <strong> Access Token</strong></li>
            </ol>
          </div>

          <label>
            <span style={etiqueta}>Access Token</span>
            <input
              style={campo} value={token} type="password" autoComplete="off"
              onChange={(e) => setToken(e.target.value)}
              placeholder="APP_USR-..."
            />
            <span style={ayuda}>
              Empieza con <code>APP_USR-</code>. Si empieza con <code>TEST-</code> es
              el de prueba y no cobra de verdad.
            </span>
          </label>

          <label>
            <span style={etiqueta}>
              Public Key <span style={{ fontWeight: 400, color: 'var(--ag-ink-3)' }}>(opcional)</span>
            </span>
            <input
              style={campo} value={publicKey} autoComplete="off"
              onChange={(e) => setPublicKey(e.target.value)}
              placeholder="APP_USR-..."
            />
          </label>

          <label>
            <span style={etiqueta}>
              Firma del webhook <span style={{ fontWeight: 400, color: 'var(--ag-ink-3)' }}>(opcional)</span>
            </span>
            <input
              style={campo} value={secreto} type="password" autoComplete="off"
              onChange={(e) => setSecreto(e.target.value)}
              placeholder="Clave secreta de notificaciones"
            />
            <span style={ayuda}>
              Está en la misma pantalla de MercadoPago, en Webhooks. Sirve para
              verificar que los avisos de pago son legítimos.
            </span>
          </label>

          {error && (
            <div style={{ fontSize: 13, color: 'var(--ag-bad, #c62828)' }}>{error}</div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            {cambiando && (
              <button
                type="button" className="ag-btn-ghost"
                onClick={() => { setCambiando(false); setToken(''); setError(null); }}
              >
                Cancelar
              </button>
            )}
            <button
              type="button" className="ag-btn-primary" style={{ flex: 1 }}
              disabled={!token.trim() || guardando}
              onClick={conectar}
            >
              {guardando ? 'Verificando con MercadoPago…' : 'Conectar'}
            </button>
          </div>

          <p style={{ margin: 0, fontSize: 12, color: 'var(--ag-ink-3)', lineHeight: 1.5 }}>
            El token queda guardado del lado del servidor y no vuelve a
            mostrarse acá. Para cambiar de cuenta se pega uno nuevo.
          </p>
        </div>
      )}
    </div>
  );
}
