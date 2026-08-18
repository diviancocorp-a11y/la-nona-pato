import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { formatInt, formatOrderCode, optimizeImage } from "../lib/utils";
import { supabase } from "../lib/supabase";
import business from "@business";
import ReferralCard from "../components/catalog/ReferralCard";
import AccountMenu from "../catalog-pro/AccountMenu";
import PushOptInBanner from "../catalog-pro/PushOptInBanner";
import { lookupCustomerByPhone, phoneLogin, cleanPhone, blockPhone, isPhoneBlocked, upsertCustomer } from "../services/phoneAuth";
import { setGuestUser } from "../lib/guestUser";
import { Avatar, AVATARS, AVATAR_KEYS, getLocalAvatarKey, setLocalAvatarKey, avatarKeyFor } from "../lib/avatars.jsx";
import { fetchFavoriteProducts } from '../services/account';

const TABS = ["perfil", "direcciones", "historial", "favoritos", "cupones", "referidos"];
const TAB_ICONS = { perfil: "👤", direcciones: "📍", historial: "📦", favoritos: "❤️", cupones: "🎟️", referidos: "🎁" };

export default function MyAccount() {
  const navigate = useNavigate();
  const { user, profile, addresses, favorites, loading, sendMagicLink, updateProfile, addAddress, removeAddress, getOrderHistory, phoneSession, session, sessionLogout } = useAuth();

  const [tab, setTab] = useState(() => {
    // Leer ?tab= de la URL para abrir directamente la seccion deseada
    try {
      const url = new URL(window.location.href);
      const t = url.searchParams.get("tab");
      const valid = ["perfil", "direcciones", "historial", "favoritos", "cupones", "referidos"];
      return valid.includes(t) ? t : "perfil";
    } catch { return "perfil"; }
  });
  const [orders, setOrders] = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(false);

  // Login state
  const [loginEmail, setLoginEmail] = useState("");
  const [linkSent, setLinkSent] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [sendingLink, setSendingLink] = useState(false);
  const [authMode, setAuthMode] = useState("login"); // "login" | "register"
  const [showNotRegistered, setShowNotRegistered] = useState(false);
  // Registration fields
  const [regName, setRegName] = useState("");
  const [regLastName, setRegLastName] = useState("");
  const [regPhone, setRegPhone] = useState("");

  // Profile edit state
  const [editName, setEditName] = useState("");
  const [editLastName, setEditLastName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editNickname, setEditNickname] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Address form state
  const [showAddrForm, setShowAddrForm] = useState(false);
  const [addrLabel, setAddrLabel] = useState("Casa");
  const [addrText, setAddrText] = useState("");
  const [addrNotes, setAddrNotes] = useState("");
  const [addingAddr, setAddingAddr] = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [deletingAddr, setDeletingAddr] = useState(false);

  // Favorites products
  const [favProducts, setFavProducts] = useState([]);
  const [purchaseStats, setPurchaseStats] = useState({});

  // Cupones
  const [couponSearch, setCouponSearch] = useState("");

  // Avatar: asignado por nombre, el cliente puede cambiarlo. Local primero
  // (visible al instante) + customers.avatar_key via RPC (lo ve el ranking).
  const [avatarKey, setAvatarKey] = useState(getLocalAvatarKey());
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);

  const pickAvatar = async (key) => {
    setAvatarKey(key);
    setLocalAvatarKey(key);
    setShowAvatarPicker(false);
    try {
      const src = profile || phoneSession || {};
      await supabase.rpc("set_customer_avatar", {
        p_phone: src.phone || null,
        p_email: src.email || user?.email || null,
        p_avatar: key,
      });
    } catch { /* sin pedido previo todavia: queda local y listo */ }
  };

  // Sync profile/phoneSession fields. Splitea name en nombre + apellido.
  useEffect(() => {
    const src = profile || phoneSession || {};
    const full = (src.name || "").trim();
    const parts = full.split(/\s+/);
    setEditName(parts[0] || "");
    setEditLastName(parts.slice(1).join(" ") || "");
    setEditPhone(src.phone || "");
    setEditNickname(src.nickname || "");
    setEditEmail(src.email || user?.email || "");
  }, [profile, phoneSession, user]);

  // Si el usuario se logueó y tiene un carrito pendiente, volver al checkout
  useEffect(() => {
    if (user && !loading) {
      try {
        const saved = sessionStorage.getItem("hg_cart");
        if (saved && JSON.parse(saved).length > 0) {
          navigate("/");
        }
      } catch {}
    }
  }, [user, loading]);

  // Load orders on tab switch
  useEffect(() => {
    if (tab === "historial" && user && orders.length === 0) {
      setLoadingOrders(true);
      getOrderHistory().then(data => { setOrders(data); setLoadingOrders(false); });
    }
  }, [tab, user]);

  // Load favorite products
  useEffect(() => {
    if (tab === "favoritos" && favorites.length > 0) {
      // Via services/account: en el edificio los productos viven en
      // `products` con `price`, no en `recipes` con `sale_price`.
      fetchFavoriteProducts(favorites).then(setFavProducts);
    } else if (tab === "favoritos" && favorites.length === 0) {
      setFavProducts([]);
    }
  }, [tab, favorites]);

  if (loading) return (
    <div className="cp-root cp-surface" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
      <p style={{ color: "var(--t3)", fontSize: 15 }}>Cargando...</p>
    </div>
  );

  // --- LOGIN PHONE-FIRST ---
  // Solo redirigir al login si NO hay ningun tipo de sesion (ni Supabase Auth ni phone-only).
  if (!user && !phoneSession) {
    return <PhoneLoginScreen onLoggedIn={() => navigate("/")} navigate={navigate} />;
  }

  // --- LOGGED IN: MY ACCOUNT ---
  return (
    <div className="cp-root cp-surface" style={{ minHeight: "100vh" }}>
      <style>{`
        .cki-tokens { width: 100%; height: 44px; padding: 0 14px; background: var(--bg); color: var(--tx); border: 1px solid var(--line); border-radius: 12px; font-family: inherit; font-size: 14px; outline: none; box-sizing: border-box; }
        .cki-tokens:focus { border-color: var(--ac); }
        .cki-tokens:disabled { opacity: 0.6; background: var(--b2); cursor: not-allowed; }
        .abtn-tokens { padding: 12px 16px; background: var(--ac); color: #fff; border: 0; border-radius: 12px; font-family: inherit; font-size: 14px; font-weight: 600; cursor: pointer; }
        .abtn-tokens:disabled { opacity: 0.5; cursor: not-allowed; }
      `}</style>
      {/* Header */}
      <div style={{ padding: "16px 20px", display: "flex", alignItems: "center", gap: 12, borderBottom: "1px solid var(--b2)" }}>
        <button onClick={() => navigate("/")} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "var(--tx)", padding: 4 }}>←</button>
        {/* Avatar (tap para cambiarlo — el mismo que aparece en el ranking) */}
        <button onClick={() => setShowAvatarPicker(true)} aria-label="Cambiar avatar" style={{
          position: "relative", background: "none", border: "none", padding: 0, cursor: "pointer", flexShrink: 0,
        }}>
          <Avatar name={(profile || phoneSession)?.name} avatarKey={avatarKey} size={46}
            style={{ border: "2px solid var(--line)" }} />
          <span style={{
            position: "absolute", bottom: -2, right: -2, width: 18, height: 18, borderRadius: 999,
            background: "var(--ac)", color: "#fff", fontSize: 10, lineHeight: 1,
            display: "flex", alignItems: "center", justifyContent: "center",
            border: "2px solid var(--bg)",
          }}>✎</span>
        </button>
        <div style={{ flex: 1 }}>
          <h2 style={{ fontFamily: "'DM Serif Display',serif", fontSize: 20, margin: 0 }}>Mi Cuenta</h2>
          <div style={{ fontSize: 12, color: "var(--t3)", marginTop: 2 }}>{user?.email || phoneSession?.email || phoneSession?.phone || ""}</div>
        </div>
        <AccountMenu
          session={session}
          onSelect={(t) => { if (t) setTab(t); else navigate("/mi-cuenta"); }}
          onLogout={async () => { await sessionLogout(); navigate("/"); }}
        />
      </div>

      {/* Picker de avatar */}
      {showAvatarPicker && (
        <div onClick={() => setShowAvatarPicker(false)} style={{
          position: "fixed", inset: 0, zIndex: 8000,
          background: "rgba(0,0,0,0.45)", backdropFilter: "blur(3px)",
          display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
        }}>
          <div onClick={(e) => e.stopPropagation()} style={{
            width: "100%", maxWidth: 360, background: "var(--bg)", borderRadius: 22,
            border: "1px solid var(--line)", padding: "20px 18px",
            boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <h3 style={{ fontFamily: "'DM Serif Display',serif", fontSize: 19, margin: 0, color: "var(--tx)" }}>Elegí tu avatar</h3>
              <button onClick={() => setShowAvatarPicker(false)} aria-label="Cerrar" style={{
                width: 30, height: 30, borderRadius: 99, border: "none", background: "var(--b2)",
                color: "var(--t2)", fontSize: 14, cursor: "pointer", lineHeight: 1,
              }}>✕</button>
            </div>
            <p style={{ fontSize: 12, color: "var(--t3)", margin: "0 0 14px" }}>
              Es el que te representa en el ranking semanal.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10 }}>
              {AVATAR_KEYS.map((k) => {
                const selected = (avatarKey || avatarKeyFor((profile || phoneSession)?.name)) === k;
                return (
                  <button key={k} onClick={() => pickAvatar(k)} aria-label={`Avatar ${k}`} style={{
                    padding: 0, border: "none", background: "none", cursor: "pointer",
                    borderRadius: 999,
                    outline: selected ? "3px solid var(--ac)" : "2px solid var(--line)",
                    outlineOffset: 1,
                  }}>
                    <div style={{ width: "100%", aspectRatio: "1/1", borderRadius: 999, overflow: "hidden", background: "#fff" }}>
                      <img src={AVATARS[k]} alt="" draggable={false} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Tabs eliminados — la barra del header del catalogo ya da accesos directos
          via ?tab=. Si queres cambiar de seccion, volves al home y la eliges del menu. */}

      <div style={{ padding: "20px 16px" }}>

        {/* Push opt-in: aparece arriba del contenido en perfil/historial.
            Se oculta solo si ya esta suscrito o el user dijo "Ahora no". */}
        {(tab === "perfil" || tab === "historial") && (
          <PushOptInBanner session={session} />
        )}

        {/* ─── PERFIL ─── */}
        {tab === "perfil" && (
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--t3)", textTransform: "uppercase", letterSpacing: 0.5 }}>Datos personales</div>
              {!editing && (
                <button onClick={() => setEditing(true)}
                  style={{ padding: "6px 14px", background: "transparent", border: "1px solid var(--ac)", color: "var(--ac)", borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                  Editar
                </button>
              )}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 12, fontWeight: 700, color: "var(--t3)", marginBottom: 4, display: "block" }}>Nombre</label>
                  <input className="cki-tokens" value={editName} disabled={!editing} onChange={e => setEditName(e.target.value)} placeholder="Juan" />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 12, fontWeight: 700, color: "var(--t3)", marginBottom: 4, display: "block" }}>Apellido</label>
                  <input className="cki-tokens" value={editLastName} disabled={!editing} onChange={e => setEditLastName(e.target.value)} placeholder="Pérez" />
                </div>
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: "var(--t3)", marginBottom: 4, display: "block" }}>Apodo (opcional)</label>
                <input className="cki-tokens" value={editNickname} disabled={!editing} onChange={e => setEditNickname(e.target.value.slice(0, 30))} placeholder="Cómo te gusta que te llamen" />
                <p style={{ fontSize: 11, color: "var(--t3)", margin: "4px 0 0", lineHeight: 1.5 }}>
                  Si lo cargás, el catálogo te saluda con tu apodo.
                </p>
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: "var(--t3)", marginBottom: 4, display: "block" }}>Teléfono</label>
                <input className="cki-tokens" type="tel" value={editPhone} disabled placeholder="Ej: 1155443322" />
                <p style={{ fontSize: 11, color: "var(--t3)", margin: "4px 0 0", lineHeight: 1.5 }}>
                  El teléfono es tu identidad. Para cambiarlo contactanos.
                </p>
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: "var(--t3)", marginBottom: 4, display: "block" }}>Email</label>
                <input
                  className="cki-tokens" type="email"
                  value={editEmail}
                  disabled={!!user || !editing}
                  onChange={e => setEditEmail(e.target.value)}
                  placeholder={!user ? "tu@email.com" : ""}
                  style={{ opacity: user ? 0.6 : 1 }}
                />
                {!user && !phoneSession?.email && (
                  <p style={{ fontSize: 11, color: "var(--t3)", margin: "6px 0 0", lineHeight: 1.5 }}>
                    Cargá tu email para acceder a cupones y direcciones guardadas en la nube.
                  </p>
                )}
                {!user && phoneSession?.email && (
                  <p style={{ fontSize: 11, color: "var(--ok, #2A9D6E)", margin: "6px 0 0", lineHeight: 1.5 }}>
                    ✓ Email registrado. Iniciá sesión con magic link para acceder a cupones y direcciones.
                  </p>
                )}
              </div>
            </div>
            {editing && <button
              className="abtn-tokens"
              style={{ width: "100%", marginTop: 16 }}
              disabled={saving}
              onClick={async () => {
                setSaving(true);
                const fullName = `${editName.trim()} ${editLastName.trim()}`.trim();
                // Para phone-only: usar upsertCustomer (no hay user de auth real).
                if (phoneSession && !user) {
                  try {
                    const emailClean = (editEmail || phoneSession.email || "").trim().toLowerCase();
                    await upsertCustomer({
                      phone: editPhone || phoneSession.phone,
                      email: emailClean || null,
                      name: fullName,
                      nickname: editNickname || null,
                    });
                    // actualizar guestUser local (incluyendo nickname y email nuevo)
                    setGuestUser({
                      id: phoneSession.id,
                      name: fullName,
                      nickname: editNickname || "",
                      phone: editPhone || phoneSession.phone,
                      email: emailClean,
                    });
                    setSaving(false); setSaved(true); setEditing(false); setTimeout(() => setSaved(false), 2000);
                  } catch (e) { console.warn(e); setSaving(false); }
                  return;
                }
                // Auth real -> updateProfile (Supabase)
                const ok = await updateProfile({ name: fullName, phone: editPhone, nickname: editNickname });
                setSaving(false);
                if (ok) { setSaved(true); setEditing(false); setTimeout(() => setSaved(false), 2000); }
              }}
            >
              {saving ? "Guardando..." : saved ? "✓ Guardado" : "Guardar cambios"}
            </button>}
          </div>
        )}

        {/* ─── DIRECCIONES ─── */}
        {tab === "direcciones" && !user && (
          <AccessGate
            tabLabel="direcciones"
            hasEmail={!!(phoneSession?.email)}
            email={phoneSession?.email || ""}
            sendMagicLink={sendMagicLink}
            setEditing={setEditing}
            setTab={setTab}
            phoneSession={phoneSession}
          />
        )}
        {tab === "direcciones" && user && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--t3)", textTransform: "uppercase", letterSpacing: 0.5 }}>Mis direcciones</div>
              <button onClick={() => setShowAddrForm(!showAddrForm)} style={{ padding: "6px 14px", background: "var(--ac)", color: "#fff", border: "none", borderRadius: 10, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                {showAddrForm ? "Cancelar" : "+ Agregar"}
              </button>
            </div>

            {showAddrForm && (
              <div style={{ background: "var(--b2)", borderRadius: 14, padding: "16px", marginBottom: 16 }}>
                <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                  {["Casa", "Trabajo", "Otro"].map(l => (
                    <button key={l} onClick={() => setAddrLabel(l)} style={{
                      padding: "6px 14px", borderRadius: 20, border: "none", fontSize: 12, fontWeight: 600, cursor: "pointer",
                      background: addrLabel === l ? "var(--ac)" : "var(--bg)", color: addrLabel === l ? "#fff" : "var(--t2)",
                    }}>{l}</button>
                  ))}
                </div>
                <button
                  onClick={async () => {
                    setGeoLoading(true);
                    try {
                      const position = await new Promise((resolve, reject) => {
                        navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10000 });
                      });
                      const { latitude, longitude } = position.coords;
                      const geoRes = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&addressdetails=1&zoom=18`);
                      const geoData = await geoRes.json();
                      let a = geoData.address || {};
                      let street = a.road || a.pedestrian || a.footway || "";
                      let number = a.house_number || "";
                      // Si no hay número, intentar zoom más alto
                      if (!number && street) {
                        try {
                          const r2 = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&addressdetails=1&zoom=21`);
                          const d2 = await r2.json();
                          number = d2.address?.house_number || "";
                        } catch {}
                      }
                      // Buscar dirección cercana con número
                      if (!number && street) {
                        try {
                          const sq = encodeURIComponent(`${street}, ${a.city || a.town || a.village || ""}, Argentina`);
                          const r3 = await fetch(`https://nominatim.openstreetmap.org/search?q=${sq}&format=json&addressdetails=1&limit=5&viewbox=${longitude-0.002},${latitude+0.002},${longitude+0.002},${latitude-0.002}&bounded=1`);
                          const results = await r3.json();
                          let bestNum = "", bestDist = Infinity;
                          const hav = (la1,lo1,la2,lo2) => { const R=6371,dL=(la2-la1)*Math.PI/180,dO=(lo2-lo1)*Math.PI/180,x=Math.sin(dL/2)**2+Math.cos(la1*Math.PI/180)*Math.cos(la2*Math.PI/180)*Math.sin(dO/2)**2; return R*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x)); };
                          for (const res of results) {
                            if (res.address?.house_number) {
                              const dist = hav(latitude, longitude, parseFloat(res.lat), parseFloat(res.lon));
                              if (dist < bestDist) { bestDist = dist; bestNum = res.address.house_number; }
                            }
                          }
                          if (bestNum) number = bestNum;
                        } catch {}
                      }
                      // Último recurso: estimar número aproximado
                      if (!number) {
                        const approx = Math.round(Math.abs((latitude * 10000) % 9000) / 5) * 5 + 100;
                        number = `~${approx}`;
                      }
                      const locality = a.city || a.town || a.village || a.suburb || "";
                      setAddrText(street ? `${street} ${number}, ${locality}`.trim() : geoData.display_name?.split(",").slice(0, 3).join(",") || "");
                    } catch (err) {
                      alert("No pudimos obtener tu ubicación. Asegurate de permitir acceso a la ubicación en tu navegador.");
                    }
                    setGeoLoading(false);
                  }}
                  disabled={geoLoading}
                  style={{ padding: "8px 14px", background: "var(--bg)", border: "1px solid var(--b2)", borderRadius: 10, fontSize: 12, fontWeight: 600, color: "var(--t2)", cursor: "pointer", marginBottom: 8, width: "100%" }}
                >
                  {geoLoading ? "Localizando..." : "📍 Usar mi ubicación actual"}
                </button>
                <input className="cki-tokens" value={addrText} onChange={e => setAddrText(e.target.value)} placeholder="Calle, número, localidad..." style={{ marginBottom: 8 }} />
                <input className="cki-tokens" value={addrNotes} onChange={e => setAddrNotes(e.target.value)} placeholder="Piso, depto, timbre (opcional)" style={{ marginBottom: 12 }} />
                <button
                  className="abtn-tokens"
                  style={{ width: "100%", fontSize: 13 }}
                  disabled={addingAddr || addrText.length < 5}
                  onClick={async () => {
                    setAddingAddr(true);
                    await addAddress({ label: addrLabel, address: addrText, notes: addrNotes });
                    setAddingAddr(false);
                    setAddrText("");
                    setAddrNotes("");
                    setShowAddrForm(false);
                  }}
                >
                  {addingAddr ? "Guardando..." : "Guardar dirección"}
                </button>
              </div>
            )}

            {addresses.length === 0 && !showAddrForm && (
              <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--t3)" }}>
                <div style={{ fontSize: 40, marginBottom: 8 }}>📍</div>
                <p style={{ fontSize: 14 }}>No tenés direcciones guardadas</p>
                <p style={{ fontSize: 12, marginTop: 4 }}>Agregá una para que el checkout sea más rápido</p>
              </div>
            )}

            {addresses.map(a => (
              <div key={a.id} style={{ background: "var(--bg)", border: confirmDeleteId === a.id ? "1.5px solid var(--rd)" : "1px solid var(--b2)", borderRadius: 14, padding: "14px 16px", marginBottom: 8, transition: "border .2s" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "var(--ac)", marginBottom: 4 }}>{a.label}</div>
                    <div style={{ fontSize: 14, color: "var(--tx)", lineHeight: 1.4 }}>{a.address}</div>
                    {a.notes && <div style={{ fontSize: 12, color: "var(--t3)", marginTop: 4 }}>{a.notes}</div>}
                  </div>
                  <button onClick={() => setConfirmDeleteId(confirmDeleteId === a.id ? null : a.id)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, color: "var(--t3)", padding: "4px 8px" }}>
                    🗑
                  </button>
                </div>
                {confirmDeleteId === a.id && (
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--b2)", display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 13, color: "var(--rd)", fontWeight: 600, flex: 1 }}>¿Eliminar esta dirección?</span>
                    <button
                      disabled={deletingAddr}
                      onClick={async () => { setDeletingAddr(true); await removeAddress(a.id); setDeletingAddr(false); setConfirmDeleteId(null); }}
                      style={{ padding: "7px 16px", background: "var(--rd)", color: "#fff", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer" }}
                    >{deletingAddr ? "..." : "Eliminar"}</button>
                    <button
                      onClick={() => setConfirmDeleteId(null)}
                      style={{ padding: "7px 16px", background: "var(--b2)", color: "var(--tx)", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                    >Cancelar</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ─── HISTORIAL ─── */}
        {tab === "historial" && (
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--t3)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 16 }}>Mis pedidos</div>

            {loadingOrders && <p style={{ fontSize: 14, color: "var(--t3)", textAlign: "center", padding: 20 }}>Cargando pedidos...</p>}

            {!loadingOrders && orders.length === 0 && (
              <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--t3)" }}>
                <div style={{ fontSize: 40, marginBottom: 8 }}>📦</div>
                <p style={{ fontSize: 14 }}>Todavía no hiciste pedidos</p>
                <button onClick={() => navigate("/")} className="abtn-tokens" style={{ marginTop: 12, fontSize: 13 }}>Ir a la tienda</button>
              </div>
            )}

            {orders.map(o => {
              const statusMap = { new: "Nuevo", confirmed: "Confirmado", preparing: "Preparando", ready: "Listo", delivering: "En camino", delivered: "Entregado", cancelled: "Cancelado" };
              const statusColors = { new: "var(--ac)", confirmed: "var(--ac)", preparing: "var(--ac)", ready: "var(--ok, #2A9D6E)", delivering: "var(--ac)", delivered: "var(--ok, #2A9D6E)", cancelled: "var(--err, #C62828)" };
              const isActive = ["new", "confirmed", "preparing", "ready", "delivering"].includes(o.status);
              const isDelivered = o.status === "delivered";
              return (
                <div key={o.id} style={{ background: "var(--bg)", border: "1px solid var(--b2)", borderRadius: 14, padding: "14px 16px", marginBottom: 8 }}>
                  <div onClick={() => navigate(`/order/${o.id}`)} style={{ cursor: "pointer" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <code style={{ fontSize: 13, fontWeight: 700, color: "var(--tx)", letterSpacing: 1 }}>{formatOrderCode(o.id)}</code>
                      <span style={{ fontSize: 11, fontWeight: 700, color: statusColors[o.status] || "var(--t3)", background: `${statusColors[o.status] || "var(--t3)"}15`, padding: "3px 10px", borderRadius: 20 }}>
                        {statusMap[o.status] || o.status}
                      </span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--t3)" }}>
                      <span>{o.date || o.created_at?.split("T")[0]}</span>
                      <span style={{ fontWeight: 700, color: "var(--tx)" }}>${formatInt(o.total)}</span>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--b2)" }}>
                    {isActive && (
                      <button onClick={() => navigate(`/order/${o.id}`)} style={{ flex: 1, padding: "6px 8px", background: "var(--ac)", color: "#fff", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                        🔴 Seguir pedido
                      </button>
                    )}
                    {isDelivered && (
                      <button onClick={() => navigate("/")} style={{ flex: 1, padding: "6px 8px", background: "var(--ac)", color: "#fff", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                        🔄 Repetir pedido
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ─── FAVORITOS ─── */}
        {tab === "favoritos" && (
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--t3)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 16 }}>Mis favoritos</div>

            {favorites.length === 0 && (
              <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--t3)" }}>
                <div style={{ fontSize: 40, marginBottom: 8 }}>❤️</div>
                <p style={{ fontSize: 14 }}>No tenés favoritos todavía</p>
                <p style={{ fontSize: 12, marginTop: 4 }}>Tocá el corazón en un producto del catálogo para agregarlo</p>
                <button onClick={() => navigate("/")} className="abtn-tokens" style={{ marginTop: 12, fontSize: 13 }}>Ir a la tienda</button>
              </div>
            )}

            {favorites.length > 0 && favProducts.length > 0 && (
              <div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 12, marginBottom: 16 }}>
                  {favProducts.map(p => {
                    const purchaseCount = purchaseStats[p.id] || 0;
                    const loyaltyProgress = Math.min((purchaseCount / 10) * 100, 100);
                    return (
                      <div key={p.id} style={{ background: "var(--bg)", border: "1px solid var(--b2)", borderRadius: 12, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                        <div style={{ width: "100%", aspectRatio: "1", overflow: "hidden", background: "var(--b2)", cursor: "pointer" }} onClick={() => navigate(`/product/${p.id}`)}>
                          {p.image_url && <img src={optimizeImage(p.image_url, 200, 200)} alt={p.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
                        </div>
                        <div style={{ padding: "12px", fontSize: 12, flex: 1, display: "flex", flexDirection: "column" }}>
                          <div style={{ fontWeight: 600, color: "var(--tx)", marginBottom: 4, minHeight: "2.4em", overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", cursor: "pointer" }} onClick={() => navigate(`/product/${p.id}`)}>{p.name}</div>
                          {p.category && <div style={{ fontSize: 11, color: "var(--t3)", marginBottom: 6 }}>{p.category}</div>}
                          {p.sale_price && <div style={{ fontWeight: 700, color: "var(--ac)", marginBottom: 8 }}>${formatInt(p.sale_price)}</div>}
                          <div style={{ fontSize: 10, color: "var(--t3)", marginBottom: 8 }}>Compraste este producto {purchaseCount} veces</div>
                          <div style={{ marginBottom: 8 }}>
                            <div style={{ fontSize: 10, color: "var(--t3)", marginBottom: 3 }}>Comprá 10 veces para ganar un cupón gratis</div>
                            <div style={{ background: "var(--b2)", borderRadius: 6, height: 6, overflow: "hidden" }}>
                              <div style={{ background: "var(--ac)", height: "100%", width: `${loyaltyProgress}%`, transition: "width 0.3s ease" }}></div>
                            </div>
                          </div>
                          <button
                            onClick={() => {
                              try {
                                const saved = sessionStorage.getItem("hg_cart");
                                const cart = saved ? JSON.parse(saved) : [];
                                const existingItem = cart.find(item => item.id === p.id);
                                if (existingItem) {
                                  existingItem.qty += 1;
                                } else {
                                  cart.push({
                                    id: p.id,
                                    name: p.name,
                                    price: p.sale_price,
                                    qty: 1,
                                    img: p.image_url
                                  });
                                }
                                sessionStorage.setItem("lnp_cart", JSON.stringify(cart));
                              } catch {}
                            }}
                            style={{ padding: "6px 8px", background: "var(--ac)", color: "#fff", border: "none", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer", width: "100%" }}
                          >
                            + Agregar
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {(() => {
                  try {
                    const saved = sessionStorage.getItem("hg_cart");
                    const cart = saved ? JSON.parse(saved) : [];
                    const cartCount = cart.reduce((sum, item) => sum + item.qty, 0);
                    if (cartCount > 0) {
                      return (
                        <button onClick={() => navigate("/")} className="abtn-tokens" style={{ width: "100%", fontSize: 14, marginBottom: 12 }}>
                          Ver mi pedido ({cartCount} items)
                        </button>
                      );
                    }
                  } catch {}
                  return null;
                })()}
                <button onClick={() => navigate("/")} className="abtn-tokens" style={{ width: "100%", fontSize: 14 }}>
                  Ir a la tienda
                </button>
              </div>
            )}
          </div>
        )}

        {/* ─── CUPONES Y DESCUENTOS ─── */}
        {tab === "cupones" && !user && (
          <AccessGate
            tabLabel="cupones"
            hasEmail={!!(phoneSession?.email)}
            email={phoneSession?.email || ""}
            sendMagicLink={sendMagicLink}
            setEditing={setEditing}
            setTab={setTab}
            phoneSession={phoneSession}
          />
        )}
        {tab === "cupones" && user && (
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--t3)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 16 }}>Descuentos y cupones</div>

            <div style={{ background: "linear-gradient(135deg, var(--ac-soft, var(--b2)), var(--ac-soft, var(--b2)))", borderRadius: 14, padding: "16px", marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ac)", marginBottom: 8 }}>Descuentos Rotativos Diarios</div>
              <p style={{ fontSize: 12, color: "var(--ac)", lineHeight: 1.6, marginBottom: 10 }}>
                Cada lunes a jueves tenemos un descuento del 15% en diferentes categorías:
              </p>
              <div style={{ display: "grid", gap: 6 }}>
                {[
                  { day: "Lunes", categories: "Pastas" },
                  { day: "Martes", categories: "Salsas y condimentos" },
                  { day: "Miércoles", categories: "Conservas" },
                  { day: "Jueves", categories: "Bebidas" }
                ].map((d, i) => (
                  <div key={i} style={{ fontSize: 12, color: "var(--ac)" }}>
                    <strong>{d.day}:</strong> {d.categories}
                  </div>
                ))}
              </div>
            </div>

            <input
              className="cki-tokens"
              type="text"
              value={couponSearch}
              onChange={e => setCouponSearch(e.target.value)}
              placeholder="Buscar cupón..."
              style={{ width: "100%", marginBottom: 16 }}
            />

            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--tx)", marginBottom: 10 }}>Cupones activos</div>
              <div style={{ textAlign: "center", padding: "24px 16px", color: "var(--t3)", background: "var(--bg)", borderRadius: 12, border: "1px solid var(--b2)" }}>
                <div style={{ fontSize: 24, marginBottom: 8 }}>🎫</div>
                <p style={{ fontSize: 13, margin: 0 }}>No tenés cupones activos</p>
              </div>
            </div>

            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--tx)", marginBottom: 10 }}>Cupones vencidos</div>
              <div style={{ textAlign: "center", padding: "24px 16px", color: "var(--t3)", background: "var(--bg)", borderRadius: 12, border: "1px solid var(--b2)" }}>
                <div style={{ fontSize: 24, marginBottom: 8 }}>🎫</div>
                <p style={{ fontSize: 13, margin: 0 }}>No tenés cupones vencidos</p>
              </div>
            </div>
          </div>
        )}

        {/* ─── REFERIDOS ─── */}
        {tab === "referidos" && (
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--t3)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 16 }}>Programa de referidos</div>
            <ReferralCard phone={profile?.phone} name={profile?.full_name} />
            <div style={{ fontSize: 12, color: "var(--t3)", lineHeight: 1.6, marginTop: 12, padding: "0 4px" }}>
              Compartí tu código con amigos. Cuando hagan su primer pedido usando tu código, ambos reciben un descuento en su próxima compra.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


// ─── PhoneLoginScreen ──────────────────────────────────────────────
// Login phone-only. Input telefono -> lookup -> "¿Sos vos Juan?" / signup.
function PhoneLoginScreen({ onLoggedIn, navigate }) {
  const [phone, setPhone] = useState("");
  const [step, setStep] = useState("phone"); // phone | confirm | signup
  const [match, setMatch] = useState(null);  // { displayName, hasEmail }
  const [signupName, setSignupName] = useState("");
  const [signupLast, setSignupLast] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const validPhone = cleanPhone(phone).length >= 10;
  const validSignup = signupName.trim().length >= 2 && signupLast.trim().length >= 2
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(signupEmail.trim());

  const handleContinue = async () => {
    if (!validPhone) return;
    // Verificar si este telefono esta bloqueado en este dispositivo (cooldown 10min)
    const block = isPhoneBlocked(phone);
    if (block.blocked) {
      setError(`Este número fue rechazado en este dispositivo. Probá en ${block.minutesLeft} ${block.minutesLeft === 1 ? "minuto" : "minutos"} o desde otro dispositivo.`);
      return;
    }
    setLoading(true); setError("");
    const found = await lookupCustomerByPhone(phone);
    setLoading(false);
    if (found) { setMatch(found); setStep("confirm"); }
    else { setStep("signup"); }
  };

  const handleSosVos = async (yes) => {
    if (!yes) {
      // Honestidad del cliente: este numero ya tiene dueno, lo bloqueamos por
      // 10 minutos en este dispositivo para evitar reintento casual.
      blockPhone(phone);
      setError("Alguien más ya se registró con este número. Por favor intentá con otro número.");
      setMatch(null);
      setStep("phone");
      return;
    }
    setLoading(true);
    // FIX: usar fullName real (no displayName anonimizado "Juan G.") y
    // propagar nickname + email para que persistan entre sesiones (no
    // perder datos al hacer logout + re-login phone).
    const realFullName = match?.fullName || match?.displayName || "";
    const result = await phoneLogin({
      phone,
      name: realFullName,
      nickname: match?.nickname || "",
      email: match?.email || "",
    });
    setLoading(false);
    if (result.ok) onLoggedIn();
    else setError("No pudimos iniciarte sesión. Intentá de nuevo.");
  };

  const handleSignup = async () => {
    if (!validSignup) {
      setError("Completá nombre, apellido y un email válido.");
      return;
    }
    setLoading(true); setError("");
    const fullName = `${signupName.trim()} ${signupLast.trim()}`;
    const result = await phoneLogin({ phone, name: fullName, email: signupEmail.trim() });
    setLoading(false);
    if (result.ok) onLoggedIn();
    else setError("Error al crear tu cuenta. Intentá de nuevo.");
  };

  return (
    <div className="cp-root cp-surface" style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "16px 20px", display: "flex", alignItems: "center", gap: 12, borderBottom: "1px solid var(--line)", background: "var(--bg)" }}>
        <button onClick={() => navigate("/")} aria-label="Atras"
          style={{ width: 38, height: 38, borderRadius: 999, background: "transparent", border: "1px solid var(--line)", color: "var(--tx)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 18 }}>←</button>
        <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 20, margin: 0, color: "var(--tx)" }}>Mi Cuenta</h2>
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "32px 24px", textAlign: "center" }}>
        <div style={{ width: 64, height: 64, borderRadius: "50%", background: "var(--ac-soft, var(--b2))", color: "var(--ac)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 18 }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
            <circle cx="12" cy="7" r="4"/>
          </svg>
        </div>

        {step === "phone" && (
          <div style={{ width: "100%", maxWidth: 360 }}>
            <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 26, margin: "0 0 8px", color: "var(--tx)" }}>Ingresá tu teléfono</h2>
            <p style={{ fontSize: 14, color: "var(--t2)", margin: "0 0 22px", lineHeight: 1.6 }}>
              Si ya pediste antes, te reconocemos. Si no, te registramos en un paso.
            </p>
            <input
              type="tel" autoFocus value={phone}
              onChange={e => { setPhone(e.target.value.replace(/\D/g, "").slice(0, 15)); setError(""); }}
              placeholder="Ej: 1155443322" maxLength={15}
              onKeyDown={e => e.key === "Enter" && validPhone && handleContinue()}
              style={{ ...inputStyle, fontSize: 17, textAlign: "center", letterSpacing: "0.05em", marginBottom: 14 }}
            />
            {phone && cleanPhone(phone).length < 10 && (
              <p style={{ fontSize: 11.5, color: "var(--err, #C62828)", margin: "0 0 12px" }}>Mínimo 10 dígitos · ({cleanPhone(phone).length}/10)</p>
            )}
            {error && <p style={{ fontSize: 12, color: "var(--err, #C62828)", margin: "0 0 12px" }}>{error}</p>}
            <button onClick={handleContinue} disabled={!validPhone || loading}
              style={{ ...btnPrimaryStyle, opacity: (!validPhone || loading) ? 0.5 : 1 }}>
              {loading ? "Buscando..." : "Continuar"}
            </button>
            <button onClick={() => navigate("/")}
              style={{ marginTop: 18, fontSize: 13, color: "var(--t3)", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}>
              ← Volver a la tienda
            </button>
          </div>
        )}

        {step === "confirm" && match && (
          <div style={{ width: "100%", maxWidth: 360 }}>
            <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 26, margin: "0 0 8px", color: "var(--tx)" }}>Hola {match.displayName}</h2>
            <p style={{ fontSize: 14, color: "var(--t2)", margin: "0 0 22px", lineHeight: 1.6 }}>
              ¿Sos vos? Si lo confirmás, entrás a tu cuenta.
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => handleSosVos(true)} disabled={loading}
                style={{ ...btnPrimaryStyle, flex: 1 }}>
                {loading ? "Entrando..." : "Sí, soy yo"}
              </button>
              <button onClick={() => handleSosVos(false)} disabled={loading}
                style={{ flex: 1, padding: "13px 16px", background: "transparent", color: "var(--tx)", border: "1px solid var(--line)", borderRadius: 12, fontFamily: "inherit", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
                No
              </button>
            </div>
            <button onClick={() => { setStep("phone"); setError(""); setMatch(null); }}
              style={{ marginTop: 18, fontSize: 13, color: "var(--t3)", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}>
              ← Otro número
            </button>
          </div>
        )}

        {step === "signup" && (
          <div style={{ width: "100%", maxWidth: 360 }}>
            <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 26, margin: "0 0 8px", color: "var(--tx)" }}>Creá tu cuenta</h2>
            <p style={{ fontSize: 14, color: "var(--t2)", margin: "0 0 18px", lineHeight: 1.6 }}>
              No encontramos este número. Completá tus datos para crear tu cuenta.
            </p>
            <div style={{ background: "var(--b2)", borderRadius: 16, padding: 18, textAlign: "left", border: "1px solid var(--line)" }}>
              <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                <div style={{ flex: 1 }}>
                  <label style={lblStyle}>Nombre</label>
                  <input style={inputStyle} value={signupName} onChange={e => setSignupName(e.target.value)} placeholder="Juan" autoFocus />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={lblStyle}>Apellido</label>
                  <input style={inputStyle} value={signupLast} onChange={e => setSignupLast(e.target.value)} placeholder="Pérez" />
                </div>
              </div>
              <label style={lblStyle}>Email</label>
              <input style={{ ...inputStyle, marginBottom: 14 }} type="email" value={signupEmail} onChange={e => setSignupEmail(e.target.value)} placeholder="tu@email.com"
                onKeyDown={e => e.key === "Enter" && validSignup && handleSignup()} />
              <p style={{ fontSize: 11, color: "var(--t3)", margin: "0 0 14px", lineHeight: 1.5 }}>
                Lo usamos para que puedas acceder a cupones y promociones por email.
              </p>
              {error && <p style={{ fontSize: 12, color: "var(--err, #C62828)", margin: "0 0 10px" }}>{error}</p>}
              <button onClick={handleSignup} disabled={!validSignup || loading}
                style={{ ...btnPrimaryStyle, fontSize: 15, opacity: (!validSignup || loading) ? 0.5 : 1 }}>
                {loading ? "Creando..." : "Crear mi cuenta"}
              </button>
            </div>
            <button onClick={() => { setStep("phone"); setError(""); }}
              style={{ marginTop: 18, fontSize: 13, color: "var(--t3)", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}>
              ← Otro número
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── AccessGate ───────────────────────────────────────────────
// Para phone-only sin sesion auth real: cupones y direcciones quedan
// gateados. Si no tiene email -> CTA "Registrá tu email". Si tiene email
// -> CTA "Mandanos magic link" para abrir sesion cloud.
//
// Importante: phone-only NO tiene cuenta en auth.users. Si intentamos
// magic link con isSignUp=false, Supabase devuelve 'not_registered'.
// Estrategia: probar primero login, si falla con not_registered probar
// signUp (que crea la cuenta auth y envia confirm email magic link).
function AccessGate({ tabLabel, hasEmail, email, sendMagicLink, setEditing, setTab, phoneSession }) {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [cooldown, setCooldown] = useState(0);

  // Countdown del reenvio
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const onSendLink = async () => {
    if (!email || sending || cooldown > 0) return;
    setSending(true); setError("");
    // 1) Probar login
    let res = await sendMagicLink(email, false);
    // 2) Si no esta registrado en auth.users, hacer signUp para crear la cuenta auth
    if (!res?.ok && res?.error === "not_registered") {
      const metadata = {
        name: phoneSession?.name || "",
        phone: phoneSession?.phone || "",
        nickname: phoneSession?.nickname || "",
      };
      res = await sendMagicLink(email, true, metadata);
    }
    setSending(false);
    if (res?.ok) { setSent(true); setCooldown(60); }
    else if (res?.error === "rate_limit") setError("Esperá un minuto antes de reenviar.");
    else if (res?.error === "already_registered") setError("Tu email ya tiene una cuenta. Probá iniciar sesión desde el login.");
    else setError(res?.error || "No pudimos enviar el link. Intentá de nuevo.");
  };

  return (
    <div style={{ padding: "32px 8px", textAlign: "center" }}>
      <div style={{ fontSize: 44, marginBottom: 14 }}>{tabLabel === "cupones" ? "🎟️" : "📍"}</div>
      <h3 style={{ fontFamily: "var(--font-heading)", fontSize: 22, margin: "0 0 8px", color: "var(--tx)" }}>
        Tus {tabLabel}
      </h3>
      {!hasEmail ? (
        <>
          <p style={{ margin: "0 auto 20px", maxWidth: 320, fontSize: 13, color: "var(--t2)", lineHeight: 1.6 }}>
            Para acceder a tus {tabLabel}, registrá tu email en tu perfil. Lo necesitamos para que estén
            sincronizados y seguros.
          </p>
          <button onClick={() => { setTab("perfil"); setEditing(true); }}
            className="abtn-tokens" style={{ padding: "12px 22px" }}>
            Registrar mi email
          </button>
        </>
      ) : (
        <>
          {sent ? (
            <div style={{ maxWidth: 340, margin: "0 auto 16px", padding: "14px 18px", background: "var(--ok-soft, rgba(42,157,110,0.1))", border: "1px solid var(--ok, #2A9D6E)", borderRadius: 12, color: "var(--ok, #2A9D6E)", fontSize: 13, fontWeight: 600 }}>
              ✓ Link enviado a <strong>{email}</strong>. Tocá el link en tu email para abrir sesión. Revisá la carpeta de spam si no lo ves.
            </div>
          ) : (
            <p style={{ margin: "0 auto 20px", maxWidth: 340, fontSize: 13, color: "var(--t2)", lineHeight: 1.6 }}>
              Para ver tus {tabLabel} necesitás iniciar sesión con tu email registrado (<strong style={{ color: "var(--tx)" }}>{email}</strong>).
              Te mandamos un link mágico para abrir sesión.
            </p>
          )}

          {error && (
            <p style={{ fontSize: 12, color: "var(--err, #C62828)", margin: "0 0 12px", maxWidth: 340, marginInline: "auto" }}>{error}</p>
          )}

          <button onClick={onSendLink} disabled={sending || cooldown > 0}
            className="abtn-tokens" style={{ padding: "12px 22px", opacity: (sending || cooldown > 0) ? 0.5 : 1 }}>
            {sending ? "Enviando..." :
             cooldown > 0 ? `Reenviar en ${cooldown}s` :
             sent ? "Reenviar link" : "Enviar link mágico"}
          </button>
        </>
      )}
    </div>
  );
}

// ─── Estilos compartidos del login (tokens-only) ──────────────────
const lblStyle = {
  display: "block", fontSize: 11, fontWeight: 700, textTransform: "uppercase",
  letterSpacing: "0.06em", color: "var(--t2)", marginBottom: 6,
};

const inputStyle = {
  width: "100%", height: 44, padding: "0 14px",
  background: "var(--bg)", color: "var(--tx)",
  border: "1px solid var(--line)", borderRadius: 12,
  fontFamily: "inherit", fontSize: 14, outline: "none",
  boxSizing: "border-box",
};

const btnPrimaryStyle = {
  width: "100%", padding: "13px 16px",
  background: "var(--ac)", color: "#fff",
  border: 0,
 borderRadius: 12,
  fontFamily: "inherit", fontSize: 14, fontWeight: 700, cursor: "pointer",
};
