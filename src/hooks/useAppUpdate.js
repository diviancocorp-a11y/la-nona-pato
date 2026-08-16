import { useCallback, useEffect, useRef, useState } from "react";
import { hardReload } from "../lib/hardReload";

// Detecta cuando hay una version nueva desplegada mientras el usuario tiene la
// app abierta. Es la causa raiz de la familia "chunk viejo tras deploy" (import
// dinamico que ya no existe -> "e is not a function" / pantalla en blanco).
//
// Dos senales, un solo aviso:
//   1) Poll de /version.json (emitido en build con __BUILD_ID__). Si el buildId
//      servido difiere del bakeado en este bundle -> hay deploy nuevo. Chequea
//      al montar, cada POLL_MS, al volver el foco a la pestania y al reconectar.
//   2) Evento vite:preloadError -> un chunk lazy fallo al cargar (deploy nuevo,
//      chunk viejo borrado). Aviso inmediato.
//
// Solo corre en PROD. Devuelve { updateAvailable, reload }.

const POLL_MS = 5 * 60 * 1000; // 5 min
const CURRENT_BUILD = typeof __BUILD_ID__ !== "undefined" ? __BUILD_ID__ : null;

export default function useAppUpdate() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  // Evita re-chequear una vez que ya avisamos (el banner queda hasta recargar).
  const doneRef = useRef(false);

  const check = useCallback(async () => {
    if (doneRef.current || !CURRENT_BUILD) return;
    try {
      const res = await fetch(`/version.json?ts=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      if (data?.buildId && data.buildId !== CURRENT_BUILD) {
        doneRef.current = true;
        setUpdateAvailable(true);
      }
    } catch {
      /* red caida / 404 en dev: ignorar, reintenta en el proximo ciclo */
    }
  }, []);

  useEffect(() => {
    if (!import.meta.env.PROD) return;

    const flag = () => {
      if (doneRef.current) return;
      doneRef.current = true;
      setUpdateAvailable(true);
    };
    // Un chunk lazy no cargo (tipico tras deploy): avisar ya.
    const onPreloadError = (e) => { e?.preventDefault?.(); flag(); };
    window.addEventListener("vite:preloadError", onPreloadError);

    check();
    const id = setInterval(check, POLL_MS);
    const onVisible = () => { if (document.visibilityState === "visible") check(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", check);

    return () => {
      window.removeEventListener("vite:preloadError", onPreloadError);
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", check);
    };
  }, [check]);

  // hardReload y no location.reload(): con un service worker activo, recargar
  // a secas vuelve a servir el build cacheado y el banner reaparece para
  // siempre. Hay que vaciarle los caches primero.
  const reload = useCallback(() => { hardReload(); }, []);

  return { updateAvailable, reload };
}
