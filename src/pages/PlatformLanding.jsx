// src/pages/PlatformLanding.jsx
// Puerta de entrada de la PLATAFORMA (divianco.app), no de un local.
//
// Se muestra cuando el hostname es la raiz: ahi no hay tenant que resolver,
// asi que el catalogo no aplica. Sin esta pantalla, fetchCatalog devuelve null
// y el catalogo lo interpreta como "Supabase caido" (setError('offline')) —
// un error de conexion que no existe.
//
// PROVISORIA: el signup self-service (elegir rubro, slug y crear la cuenta con
// provision_owner) va aca. Hasta entonces esto no promete nada que no exista:
// no hay formulario falso ni boton que no haga nada.

import { useEffect } from 'react';

const VERTICALES = [
  { emoji: '🍔', nombre: 'Gastronomía', detalle: 'Carta, pedidos, recetas y costos' },
  { emoji: '✂️', nombre: 'Barbería', detalle: 'Turnos, servicios y profesionales' },
  { emoji: '👕', nombre: 'Indumentaria', detalle: 'Talles, colores y stock por variante' },
];

export default function PlatformLanding() {
  useEffect(() => {
    document.title = 'Hermes — el sistema para tu negocio';
  }, []);

  return (
    <main
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 32,
        padding: '48px 24px',
        textAlign: 'center',
        background: '#0f0e0d',
        color: '#f5f1ea',
        fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif',
      }}
    >
      <div>
        <div style={{ fontSize: 44, fontWeight: 800, letterSpacing: '-0.02em' }}>Hermes</div>
        <p style={{ margin: '12px auto 0', maxWidth: 460, fontSize: 17, lineHeight: 1.5, opacity: 0.75 }}>
          Catálogo online, pedidos, stock y reportes para tu negocio.
          Un link propio para tus clientes, un panel para vos.
        </p>
      </div>

      <div
        style={{
          display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 12,
          maxWidth: 620,
        }}
      >
        {VERTICALES.map((v) => (
          <div
            key={v.nombre}
            style={{
              flex: '1 1 180px', padding: '18px 16px', borderRadius: 14,
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.09)',
            }}
          >
            <div style={{ fontSize: 26 }}>{v.emoji}</div>
            <div style={{ marginTop: 8, fontWeight: 650, fontSize: 15 }}>{v.nombre}</div>
            <div style={{ marginTop: 4, fontSize: 13, opacity: 0.6, lineHeight: 1.4 }}>{v.detalle}</div>
          </div>
        ))}
      </div>

      <div style={{ fontSize: 14, opacity: 0.55, maxWidth: 420, lineHeight: 1.5 }}>
        El alta de cuentas todavía no está abierta.
        <br />
        Si querés Hermes para tu local, escribinos.
      </div>

      <footer style={{ marginTop: 8, fontSize: 12, opacity: 0.35 }}>
        © {new Date().getFullYear()} Divianco
      </footer>
    </main>
  );
}
