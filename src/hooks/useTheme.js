// src/hooks/useTheme.js
// Transitional theme API. Phase 2B makes document ownership explicit while
// legacy callers keep the read-only light-theme shape they already consume.
import { useState, useEffect, useCallback } from 'react';
import { applyThemeOwner, THEME_OWNERS } from '../lib/themeOwnership';

const THEME = 'light';

export default function useTheme(owner = THEME_OWNERS.PLATFORM) {
  const [theme] = useState(THEME);

  useEffect(() => {
    applyThemeOwner(owner);
  }, [owner]);

  const setTheme = useCallback(() => {}, []);
  const toggleTheme = useCallback(() => {}, []);
  const isDark = false;
  return { theme, setTheme, toggleTheme, isDark };
}
