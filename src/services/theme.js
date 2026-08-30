// src/services/theme.js
// Theme system: loads config from DB, applies CSS custom properties.
import { supabase } from '../lib/supabase';

/** Default theme (matches legacy.css :root values) */
const DEFAULT_THEME = {
  // Light palette (Nona Pato artesanal terracotta/crema)
  color_bg: '#FBF7F2', color_bg2: '#F3EDE4', color_bg3: '#FFFFFF',
  color_tx: '#2D1B0E', color_t2: '#6B5744', color_t3: '#9C8B7A',
  color_accent: '#C45D3E', color_accent_light: '#FFF0EB',
  // Typography
  font_heading: 'DM Serif Display',
  font_body: 'DM Sans',
  font_url: 'https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;500;600;700&display=swap',
  // Radii
  radius_sm: 10, radius_base: 16, radius_lg: 24,
};

let cachedTheme = null;

/**
 * Fetch the active theme from DB. Falls back to defaults.
 */
export async function fetchActiveTheme() {
  if (cachedTheme) return cachedTheme;
  try {
    const { data, error } = await supabase
      .from('theme_config')
      .select('*')
      .eq('is_active', true)
      .limit(1)
      .single();

    if (error || !data) {
      cachedTheme = { ...DEFAULT_THEME };
    } else {
      cachedTheme = { ...DEFAULT_THEME, ...stripNulls(data) };
    }
  } catch {
    cachedTheme = { ...DEFAULT_THEME };
  }
  // Always merge derived dark palette so callers get a complete theme
  cachedTheme = { ...deriveDarkPalette(cachedTheme), ...cachedTheme };
  return cachedTheme;
}

/** Strip null values so defaults aren't overwritten */
function stripNulls(obj) {
  const result = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== null && v !== undefined) result[k] = v;
  }
  return result;
}

/**
 * Apply theme config to CSS custom properties on :root.
 * Handles both light and dark palettes, fonts, and radii.
 */
export function applyTheme(theme) {
  const root = document.documentElement;
  const s = root.style;

  // Light palette → :root vars
  s.setProperty('--bg', theme.color_bg);
  s.setProperty('--b2', theme.color_bg2);
  s.setProperty('--b3', theme.color_bg3);
  s.setProperty('--tx', theme.color_tx);
  s.setProperty('--t2', theme.color_t2);
  s.setProperty('--t3', theme.color_t3);
  s.setProperty('--ac', theme.color_accent);
  s.setProperty('--al', theme.color_accent_light);

  // Radii
  s.setProperty('--r', `${theme.radius_base}px`);
  s.setProperty('--rs', `${theme.radius_sm}px`);

  // Fonts
  s.setProperty('--font-body', `'${theme.font_body}', sans-serif`);
  s.setProperty('--font-heading', `'${theme.font_heading}', serif`);

  // Load Google Fonts if URL changed
  loadFontUrl(theme.font_url);
}

const APPLIED_ROOT_PROPERTIES = [
  '--bg', '--b2', '--b3', '--tx', '--t2', '--t3', '--ac', '--al',
  '--r', '--rs', '--font-body', '--font-heading',
];

/** Remove the legacy tenant theme before a platform/admin surface takes over. */
export function clearAppliedTheme() {
  if (typeof document === 'undefined') return;
  const style = document.documentElement.style;
  APPLIED_ROOT_PROPERTIES.forEach((property) => style.removeProperty(property));
  document.getElementById('theme-font-link')?.remove();
}

/** Inject a <link> for Google Fonts if not already present */
function loadFontUrl(url) {
  if (!url) return;
  const existing = document.querySelector(`link[href="${url}"]`);
  if (existing) return;
  // Remove old custom font link
  const old = document.getElementById('theme-font-link');
  if (old) old.remove();
  const link = document.createElement('link');
  link.id = 'theme-font-link';
  link.rel = 'stylesheet';
  link.href = url;
  document.head.appendChild(link);
}

// ─── Auto-derive dark palette from light ────────────────────

/**
 * Auto-generate a dark mode palette from light colors.
 * Simple inversion: darken backgrounds, lighten text, warm up accent.
 */
export function deriveDarkPalette(light) {
  return {
    dark_bg: darken(light.color_bg, 0.85),
    dark_bg2: darken(light.color_bg2, 0.82),
    dark_bg3: darken(light.color_bg3, 0.78),
    dark_tx: lighten(light.color_tx, 0.75),
    dark_t2: lighten(light.color_t2, 0.45),
    dark_t3: lighten(light.color_t3, 0.25),
    dark_accent: lighten(light.color_accent, 0.2),
    dark_accent_light: darken(light.color_accent_light, 0.75),
  };
}

/** Darken a hex color by factor (0 = unchanged, 1 = black) */
function darken(hex, factor) {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(
    Math.round(r * (1 - factor)),
    Math.round(g * (1 - factor)),
    Math.round(b * (1 - factor)),
  );
}

/** Lighten a hex color by factor (0 = unchanged, 1 = white) */
function lighten(hex, factor) {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(
    Math.round(r + (255 - r) * factor),
    Math.round(g + (255 - g) * factor),
    Math.round(b + (255 - b) * factor),
  );
}

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('').toUpperCase();
}

/** Preset palettes for quick selection */
export const PRESET_PALETTES = [
  { name: 'Terracota (default)', color_accent: '#C45D3E', color_bg: '#FBF7F2', color_tx: '#2D1B0E', color_bg2: '#F3EDE4', color_t2: '#6B5744', color_t3: '#9C8B7A', color_bg3: '#FFFFFF', color_accent_light: '#FFF0EB' },
  { name: 'Azul Marino', color_accent: '#1B4F72', color_bg: '#F5F8FA', color_tx: '#1C2833', color_bg2: '#E8EEF2', color_t2: '#5D6D7E', color_t3: '#85929E', color_bg3: '#FFFFFF', color_accent_light: '#D6EAF8' },
  { name: 'Verde Bosque', color_accent: '#27674A', color_bg: '#F5FAF7', color_tx: '#1B2E20', color_bg2: '#E5F0EA', color_t2: '#4A6B55', color_t3: '#7D9B8A', color_bg3: '#FFFFFF', color_accent_light: '#D5F5E3' },
  { name: 'Rosa Pastel', color_accent: '#C2185B', color_bg: '#FDF5F8', color_tx: '#3E1929', color_bg2: '#F8E8EE', color_t2: '#7B4357', color_t3: '#A67D8E', color_bg3: '#FFFFFF', color_accent_light: '#FCE4EC' },
  { name: 'Mostaza', color_accent: '#B7950B', color_bg: '#FFFCF2', color_tx: '#2C2407', color_bg2: '#F5EED6', color_t2: '#7D6E2E', color_t3: '#A89B60', color_bg3: '#FFFFFF', color_accent_light: '#FFF9C4' },
  { name: 'Morado', color_accent: '#6C3483', color_bg: '#FAF5FC', color_tx: '#2C1338', color_bg2: '#F0E5F5', color_t2: '#6B4F7A', color_t3: '#9B85A8', color_bg3: '#FFFFFF', color_accent_light: '#F3E5F5' },
];

/** Preset font combinations */
export const PRESET_FONTS = [
  { name: 'DM (default)', font_heading: 'DM Serif Display', font_body: 'DM Sans', font_url: 'https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;500;600;700&display=swap' },
  { name: 'Playfair + Lato', font_heading: 'Playfair Display', font_body: 'Lato', font_url: 'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&family=Lato:wght@400;700&display=swap' },
  { name: 'Montserrat + Open Sans', font_heading: 'Montserrat', font_body: 'Open Sans', font_url: 'https://fonts.googleapis.com/css2?family=Montserrat:wght@500;700&family=Open+Sans:wght@400;600&display=swap' },
  { name: 'Poppins', font_heading: 'Poppins', font_body: 'Poppins', font_url: 'https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap' },
  { name: 'Inter + Merriweather', font_heading: 'Merriweather', font_body: 'Inter', font_url: 'https://fonts.googleapis.com/css2?family=Merriweather:wght@400;700&family=Inter:wght@400;500;600&display=swap' },
  { name: 'Raleway + Roboto', font_heading: 'Raleway', font_body: 'Roboto', font_url: 'https://fonts.googleapis.com/css2?family=Raleway:wght@500;700&family=Roboto:wght@400;500&display=swap' },
];

export { DEFAULT_THEME };
