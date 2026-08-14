// src/hooks/useTheme.js
// Theme hook — el admin usa la paleta de Dico (terracotta unificado).
// Cada cliente tiene su identidad en el catálogo (vía catalogBg / catalogCardBg
// / etc. en business.js → Catalog.jsx), pero el panel de gestión se queda
// con los colores de plataforma para reforzar la marca Dico.
import { useState, useEffect, useCallback } from 'react';

const THEME = 'light';

export default function useTheme() {
  const [theme] = useState(THEME);

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', THEME);
    document.body.style.background = '#FBF7F2';
  }, []);

  const setTheme = useCallback(() => {}, []);
  const toggleTheme = useCallback(() => {}, []);
  const isDark = false;
  return { theme, setTheme, toggleTheme, isDark };
}
