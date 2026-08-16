// src/components/admin/LoginScreen.jsx
// Login del admin. Layout:
//   - Esquina sup. izq.: chip Dico (firma del sistema)
//   - Centro: identidad del negocio (logo real desde settings + nombre)
//   - Form: caja muy traslúcida, botón ámbar del sistema
//
// El logo + nombre salen de la DB; caen a `business` (config compilada) si
// todavía no respondió.
//
// En la PLATAFORMA no se puede leer `settings`: desde la migración 0025 tiene
// RLS por tenant, y acá justamente no hay sesión todavía. El resultado era que
// todos los tenants mostraban la marca del build — tienda-nueva.divianco.app
// decía "Cochi", con el logo y el color de Cochi. Por eso va por el RPC
// público get_tenant_brand(slug), que devuelve sólo identidad visible.

import { useState, useEffect } from "react";
import { login } from "../../lib/adminService";
import { supabase } from "../../lib/supabase";
import business from "@business";
import { getTenantSlugSync } from "../../lib/activeTenant";
import FlowFieldBackground from "./FlowFieldBackground";
import HermesMark from "../HermesMark";

const INTRO_MS = 1400;
const AMBER = "#F59E0B";

export default function LoginScreen({ onLogin }) {
  const [stage, setStage] = useState("intro");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [remember, setRemember] = useState(true);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [dbSet, setDbSet] = useState(null);
  const [logoLoaded, setLogoLoaded] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setStage("form"), INTRO_MS);
    let mounted = true;

    if (business.platform) {
      // Subdominio -> slug sincrónico, sin red. En un host desconocido
      // (local, preview) cae al slug del build, que es el comportamiento
      // deseado en dev.
      const slug = getTenantSlugSync();
      if (slug) {
        supabase
          .rpc("get_tenant_brand", { p_slug: slug })
          .then(({ data }) => {
            if (mounted && data) {
              setDbSet({
                biz_name: data.name,
                logo_letter: data.logo_letter,
                logo_color: data.logo_color,
                logo_url: data.logo_url,
              });
            }
          })
          .catch(() => {});
      }
    } else {
      supabase
        .from("settings")
        .select("biz_name, logo_letter, logo_color, logo_url")
        .limit(1)
        .then(({ data }) => { if (mounted && data?.[0]) setDbSet(data[0]); })
        .catch(() => {});
    }

    return () => { clearTimeout(t); mounted = false; };
  }, []);

  const handle = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErr("");
    try { localStorage.setItem("hg_remember_session", remember ? "1" : "0"); } catch {}
    const res = await login(email, pass);
    setLoading(false);
    if (res.ok) onLogin();
    else setErr(res.msg);
  };

  // Identidad efectiva (DB > business compilado > fallback)
  const bizName   = dbSet?.biz_name   || business.name || "Panel de gestión";
  const bizLetter = (dbSet?.logo_letter || business.logoLetter || bizName.charAt(0) || "A").toUpperCase();
  const bizColor  = dbSet?.logo_color  || business.branding?.primary || AMBER;
  const logoUrl   = dbSet?.logo_url    || business.branding?.logoUrl || null;

  return (
    <div style={{ position:"fixed", inset:0, fontFamily:"system-ui,-apple-system,sans-serif", color:"#fff", overflow:"hidden" }}>
      <FlowFieldBackground color="#f59e0b" trailOpacity={0.08} particleCount={500} speed={0.7} bgColor="10,10,10" />
      <div style={{ position:"absolute", inset:0, background:"radial-gradient(circle at center, transparent 0%, rgba(0,0,0,0.45) 100%)", pointerEvents:"none" }} />

      {/* Splash de marca · fondo sólido con halo ámbar detrás del logo */}
      <div style={{
        position:"absolute", inset:0, zIndex:50,
        display:"flex", alignItems:"center", justifyContent:"center",
        background:"#0a0a0a",
        opacity: stage === "intro" ? 1 : 0,
        pointerEvents: stage === "intro" ? "auto" : "none",
        transition:"opacity 0.6s cubic-bezier(0.22,1,0.36,1)",
        overflow:"hidden",
      }}>
        <div style={{
          maxWidth:"min(86vw, 460px)",
          animation:"hg-splash-in 0.9s cubic-bezier(0.22,1,0.36,1) forwards",
          filter:`drop-shadow(0 18px 56px ${AMBER}66)`,
        }}>
          <HermesMark as="logo" size={420} fallback="H" color={AMBER} style={{ maxWidth:"100%", height:"auto" }} />
        </div>
      </div>

      {/* Centro: identidad del negocio + form */}
      <div style={{ position:"relative", zIndex:2, width:"100%", height:"100%", display:"flex", alignItems:"center", justifyContent:"center" }}>
        <div style={{ width:"100%", maxWidth:380, padding:"0 24px", textAlign:"center" }}>

          <div style={{
            display:"inline-block", padding:"5px 14px",
            background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.1)",
            borderRadius:999, color:"rgba(255,255,255,0.65)",
            fontSize:11, fontWeight:600, letterSpacing:"0.08em", textTransform:"uppercase",
            marginBottom:24, backdropFilter:"blur(4px)",
            opacity: stage === "intro" ? 0 : 1,
            transform: stage === "intro" ? "translateY(-8px)" : "translateY(0)",
            transition:"opacity 0.5s ease 0.2s, transform 0.5s ease 0.2s",
          }}>
            Sistema administrativo
          </div>

          {/* Logo del negocio con halo + respiración */}
          <div style={{
            position:"relative",
            width:108, height:108, margin:"0 auto",
            display:"flex", alignItems:"center", justifyContent:"center",
          }}>
            {/* Halo ámbar pulsante */}
            <div style={{
              position:"absolute", inset:-18,
              borderRadius:"50%",
              background:`radial-gradient(circle, ${bizColor}55 0%, ${bizColor}22 40%, transparent 70%)`,
              animation:"hg-halo-pulse 3.2s ease-in-out infinite",
              pointerEvents:"none",
            }} />
            {/* Avatar */}
            <div style={{
              position:"relative",
              width:96, height:96, borderRadius:28,
              background: logoUrl ? "rgba(255,255,255,0.06)" : bizColor,
              color:"#fff",
              display:"flex", alignItems:"center", justifyContent:"center",
              fontSize:46, fontWeight:800,
              boxShadow:`0 14px 38px ${bizColor}66, 0 0 0 1px rgba(255,255,255,0.08)`,
              overflow:"hidden",
              opacity:0, transform:"scale(0.85)",
              animation:"hg-login-logo-in 0.7s cubic-bezier(0.22,1,0.36,1) 0.1s forwards",
            }}>
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt={bizName}
                  onLoad={() => setLogoLoaded(true)}
                  onError={() => setLogoLoaded(false)}
                  style={{
                    width:"100%", height:"100%", objectFit:"cover",
                    opacity: logoLoaded ? 1 : 0,
                    transition:"opacity 0.4s ease",
                  }}
                />
              ) : (
                bizLetter
              )}
              {/* Fallback inicial mientras carga la imagen */}
              {logoUrl && !logoLoaded && (
                <span style={{ position:"absolute", color:"#fff", opacity:0.55 }}>{bizLetter}</span>
              )}
            </div>
          </div>

          <h1 style={{
            margin:"20px 0 4px",
            fontSize:22, fontWeight:700, letterSpacing:"-0.02em", color:"#fff",
            opacity:0, transform:"translateY(8px)",
            animation:"hg-login-title-in 0.7s cubic-bezier(0.22,1,0.36,1) 0.35s forwards",
          }}>{bizName}</h1>

          <p style={{
            margin:0, fontSize:11.5, color:"rgba(255,255,255,0.55)",
            letterSpacing:"0.1em", textTransform:"uppercase",
            opacity:0, animation:"hg-login-sub-in 0.7s ease 0.55s forwards",
          }}>Panel de gestión</p>

          {/* Form casi imperceptible */}
          <form onSubmit={handle} style={{
            marginTop:28, display:"flex", flexDirection:"column", gap:10,
            padding:"18px 16px",
            background:"rgba(255,255,255,0.03)",
            border:"1px solid rgba(255,255,255,0.06)",
            borderRadius:16,
            backdropFilter:"blur(6px)",
            WebkitBackdropFilter:"blur(6px)",
            opacity: stage === "intro" ? 0 : 1,
            transform: stage === "intro" ? "translateY(12px)" : "translateY(0)",
            transition:"opacity 0.6s cubic-bezier(0.22,1,0.36,1), transform 0.6s cubic-bezier(0.22,1,0.36,1)",
            pointerEvents: stage === "intro" ? "none" : "auto",
          }}>
            <input type="email" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} required autoComplete="email"
              style={{ padding:"13px 16px", borderRadius:12, border:"1px solid rgba(255,255,255,0.12)", background:"rgba(255,255,255,0.04)", color:"#fff", fontSize:14, fontFamily:"inherit", outline:"none", transition:"border-color 0.2s, background 0.2s" }}
              onFocus={e=>{ e.target.style.borderColor=AMBER; e.target.style.background="rgba(255,255,255,0.07)"; }}
              onBlur={e=>{ e.target.style.borderColor="rgba(255,255,255,0.12)"; e.target.style.background="rgba(255,255,255,0.04)"; }} />

            <input type="password" placeholder="Contraseña" value={pass} onChange={e=>setPass(e.target.value)} required autoComplete="current-password"
              style={{ padding:"13px 16px", borderRadius:12, border:"1px solid rgba(255,255,255,0.12)", background:"rgba(255,255,255,0.04)", color:"#fff", fontSize:14, fontFamily:"inherit", outline:"none", transition:"border-color 0.2s, background 0.2s" }}
              onFocus={e=>{ e.target.style.borderColor=AMBER; e.target.style.background="rgba(255,255,255,0.07)"; }}
              onBlur={e=>{ e.target.style.borderColor="rgba(255,255,255,0.12)"; e.target.style.background="rgba(255,255,255,0.04)"; }} />

            <label style={{ display:"flex", alignItems:"center", gap:8, padding:"6px 4px", fontSize:12, color:"rgba(255,255,255,0.65)", cursor:"pointer", userSelect:"none", textAlign:"left" }}>
              <input type="checkbox" checked={remember} onChange={e=>setRemember(e.target.checked)}
                style={{ width:14, height:14, accentColor:AMBER, cursor:"pointer" }} />
              Recordar sesión
            </label>

            {err && (
              <div style={{ padding:"10px 12px", borderRadius:10, background:"rgba(239,68,68,0.12)", color:"#fca5a5", fontSize:12, border:"1px solid rgba(239,68,68,0.25)", textAlign:"left" }}>
                {err}
              </div>
            )}

            <button type="submit" disabled={loading}
              style={{ marginTop:6, padding:"13px", borderRadius:12, border:0,
                background: loading ? `${AMBER}88` : AMBER, color:"#fff",
                fontSize:14, fontWeight:700, fontFamily:"inherit",
                cursor: loading ? "wait" : "pointer",
                transition:"background 0.2s, transform 0.1s",
                boxShadow:`0 4px 14px ${AMBER}55` }}
              onMouseDown={e=>{ e.currentTarget.style.transform="scale(0.98)"; }}
              onMouseUp={e=>{ e.currentTarget.style.transform="scale(1)"; }}
              onMouseLeave={e=>{ e.currentTarget.style.transform="scale(1)"; }}>
              {loading ? "Entrando…" : "Entrar"}
            </button>
          </form>

          <div style={{
            marginTop:28, fontSize:10, color:"rgba(255,255,255,0.3)", letterSpacing:"0.05em",
            opacity: stage === "intro" ? 0 : 1,
            transition:"opacity 0.6s ease 0.4s",
          }}>
            {business.legal?.copyrightYear ? `© ${business.legal.copyrightYear}` : ""} Divianco
          </div>
        </div>
      </div>

      <style>{`
        @keyframes hg-login-logo-in { from { opacity:0; transform:scale(0.85); } to { opacity:1; transform:scale(1); } }
        @keyframes hg-login-title-in { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
        @keyframes hg-login-sub-in { from { opacity:0; } to { opacity:1; } }
        @keyframes hg-halo-pulse {
          0%, 100% { opacity:0.5; transform:scale(0.92); }
          50%      { opacity:1;   transform:scale(1.08); }
        }
        @keyframes hg-splash-in {
          from { opacity:0; transform:scale(0.88); }
          to   { opacity:1; transform:scale(1); }
        }
        @keyframes hg-splash-halo {
          from { opacity:0; transform:scale(0.7); }
          to   { opacity:1; transform:scale(1); }
        }
        @media (prefers-reduced-motion: reduce) {
          [style*="animation"] { animation: none !important; opacity: 1 !important; }
        }
      `}</style>
    </div>
  );
}
