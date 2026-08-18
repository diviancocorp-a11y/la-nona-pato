import { createContext, useContext, useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { useGuestUser, clearGuestUser } from "../lib/guestUser.js";
import * as account from "../services/account";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // profiles es la unica fuente de verdad para el usuario logueado.
  // Incluye nickname (#114, antes vivia en customers).
  const [profile, setProfile] = useState(null);
  const [addresses, setAddresses] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [loading, setLoading] = useState(true);

  const guestUser = useGuestUser();
  const phoneSession = (!user && guestUser?.id) ? guestUser : null;

  const buildSession = () => {
    if (phoneSession) {
      const name = phoneSession.name || "";
      return {
        kind: "phone",
        id: phoneSession.id,
        name,
        nickname: phoneSession.nickname || "",
        firstName: phoneSession.nickname
          || (name ? name.trim().split(/\s+/)[0] : "")
          || (phoneSession.phone || "Cuenta"),
        email: phoneSession.email || "",
        phone: phoneSession.phone || "",
        displayName: name || "Tu cuenta",
        displaySub: phoneSession.phone || phoneSession.email || "",
        hasEmail: !!phoneSession.email,
      };
    }
    if (user) {
      const name = profile?.name || "";
      const nickname = profile?.nickname || "";
      return {
        kind: "auth",
        id: user.id,
        name,
        nickname,
        firstName: nickname
          || (name ? name.trim().split(/\s+/)[0] : "")
          || (user.email ? user.email.split("@")[0] : "Cuenta"),
        email: user.email || profile?.email || "",
        phone: profile?.phone || "",
        displayName: name || user.email || "Tu cuenta",
        displaySub: user.email || profile?.phone || "",
        hasEmail: true,
      };
    }
    return null;
  };
  const session = buildSession();

  // Las consultas viven en services/account.js, que bifurca legacy/edificio:
  // en el edificio los favoritos son product_id (no recipe_id) y el
  // historial resuelve por otras columnas. Antes esto consultaba tablas que
  // en el edificio no existian y fallaba EN SILENCIO — un .select() con
  // error devuelve {error}, no tira, asi que la cuenta quedaba vacia.
  const loadUserData = async (userId) => {
    if (!userId) {
      setProfile(null); setAddresses([]); setFavorites([]); return;
    }
    try {
      const { profile: p, addresses: a, favorites: f } = await account.fetchUserData(userId);
      setProfile(p); setAddresses(a); setFavorites(f);
    } catch (e) {
      console.warn("Error cargando datos de usuario:", e);
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: sbSession } }) => {
      const u = sbSession?.user || null;
      setUser(u);
      if (u) loadUserData(u.id);
      setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, sbSession) => {
      const u = sbSession?.user || null;
      setUser(u);
      if (u) loadUserData(u.id);
      else { setProfile(null); setAddresses([]); setFavorites([]); }
    });
    return () => subscription.unsubscribe();
  }, []);

  const translateError = (msg) => {
    if (!msg) return "Error desconocido. Intenta de nuevo.";
    const m = msg.toLowerCase();
    if (m.includes("rate limit") || m.includes("too many")) return "rate_limit";
    if (m.includes("already registered") || m.includes("already been registered")) return "already_registered";
    if (m.includes("signups not allowed") || m.includes("not allowed") || m.includes("otp_disabled")) return "not_registered";
    if (m.includes("password")) return "Error interno de registro. Intenta de nuevo.";
    if (m.includes("error sending confirmation") || m.includes("sending confirmation email")) return "Error enviando el email de confirmacion. Intenta de nuevo en unos minutos.";
    if (m.includes("invalid email")) return "Email no valido.";
    if (m.includes("network") || m.includes("fetch")) return "Error de conexion. Revisa tu internet e intenta de nuevo.";
    return msg;
  };

  const sendMagicLink = async (email, isSignUp = false, metadata = {}) => {
    try {
      if (isSignUp) {
        const randomPwd = crypto.randomUUID() + "Aa1!";
        const { data, error } = await supabase.auth.signUp({
          email,
          password: randomPwd,
          options: { emailRedirectTo: window.location.origin, data: metadata },
        });
        if (error) return { ok: false, error: translateError(error.message) };
        if (data?.user?.identities?.length === 0) return { ok: false, error: "already_registered" };
        return { ok: true };
      }
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: window.location.origin, shouldCreateUser: false },
      });
      if (error) return { ok: false, error: translateError(error.message) };
      return { ok: true };
    } catch (e) {
      return { ok: false, error: "Error de conexion. Revisa tu internet e intenta de nuevo." };
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    clearGuestUser();
    setUser(null); setProfile(null); setAddresses([]); setFavorites([]);
  };

  const phoneSignOut = () => { clearGuestUser(); };

  const sessionLogout = async () => {
    if (user) await signOut();
    else phoneSignOut();
  };

  const updateProfile = async (data) => {
    if (!user) return false;
    const ok = await account.updateProfile(user.id, data);
    if (ok) setProfile(p => ({ ...p, ...data }));
    return ok;
  };

  const addAddress = async (addr) => {
    if (!user) return null;
    const data = await account.addAddress(user.id, addr);
    if (data) setAddresses(p => [...p, data]);
    return data;
  };

  const removeAddress = async (id) => {
    if (!user) return false;
    const ok = await account.removeAddress(user.id, id);
    if (ok) setAddresses(p => p.filter(a => a.id !== id));
    return ok;
  };

  const updateAddress = async (id, data) => {
    if (!user) return false;
    const ok = await account.updateAddress(user.id, id, data);
    if (ok) setAddresses(p => p.map(a => a.id === id ? { ...a, ...data } : a));
    return ok;
  };

  const toggleFavorite = async (recipeId) => {
    if (!user) return false;
    const isFav = favorites.includes(recipeId);
    const ok = await account.toggleFavorite(user.id, recipeId, isFav);
    // Antes el estado local cambiaba aunque el insert fallara: el corazon
    // quedaba pintado y al recargar no estaba.
    if (!ok) return false;
    setFavorites(p => isFav ? p.filter(id => id !== recipeId) : [...p, recipeId]);
    return true;
  };

  const isFavorite = (recipeId) => favorites.includes(recipeId);

  const getOrderHistory = () =>
    account.fetchOrderHistory({ user, phone: phoneSession?.phone });

  return (
    <AuthContext.Provider value={{
      user, profile, addresses, favorites, loading,
      phoneSession, isPhoneOnly: !!phoneSession,
      session, sessionLogout,
      sendMagicLink, signOut, phoneSignOut,
      updateProfile,
      addAddress, removeAddress, updateAddress,
      toggleFavorite, isFavorite,
      getOrderHistory,
      reload: () => user && loadUserData(user.id),
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
