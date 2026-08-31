// src/test/theme.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock supabase
vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          limit: vi.fn(() => ({
            single: vi.fn(() => Promise.resolve({
              data: {
                id: 'test-id',
                color_bg: '#FFFFFF',
                color_accent: '#FF0000',
                font_heading: 'Arial',
                font_body: 'Helvetica',
                radius_base: 12,
              },
              error: null,
            })),
          })),
        })),
      })),
    })),
  },
}));

describe('theme service', () => {
  let service;

  beforeEach(async () => {
    vi.resetModules();
    service = await import('../services/theme');
  });

  it('DEFAULT_THEME has all required keys', () => {
    const t = service.DEFAULT_THEME;
    expect(t.color_bg).toBeDefined();
    expect(t.color_accent).toBeDefined();
    expect(t.font_heading).toBeDefined();
    expect(t.font_body).toBeDefined();
    expect(t.radius_base).toBeDefined();
    expect(t.radius_sm).toBeDefined();
    expect(t.radius_lg).toBeDefined();
  });

  it('fetchActiveTheme returns theme with defaults filled in', async () => {
    const t = await service.fetchActiveTheme();
    expect(t.color_bg).toBe('#FFFFFF'); // from DB mock
    expect(t.color_accent).toBe('#FF0000'); // from DB mock
    expect(t.dark_bg).toBeDefined(); // from defaults
    expect(t.radius_lg).toBe(24); // default, not in mock
  });

  it('deriveDarkPalette generates dark colors', () => {
    const dark = service.deriveDarkPalette(service.DEFAULT_THEME);
    expect(dark.dark_bg).toBeDefined();
    expect(dark.dark_tx).toBeDefined();
    expect(dark.dark_accent).toBeDefined();
    // Dark bg should be darker than light bg
    expect(dark.dark_bg).not.toBe(service.DEFAULT_THEME.color_bg);
  });

  it('PRESET_PALETTES has entries with required fields', () => {
    expect(service.PRESET_PALETTES.length).toBeGreaterThan(0);
    service.PRESET_PALETTES.forEach(p => {
      expect(p.name).toBeTruthy();
      expect(p.color_accent).toBeTruthy();
      expect(p.color_bg).toBeTruthy();
    });
  });

  it('PRESET_FONTS has entries with font families and URLs', () => {
    expect(service.PRESET_FONTS.length).toBeGreaterThan(0);
    service.PRESET_FONTS.forEach(f => {
      expect(f.name).toBeTruthy();
      expect(f.font_heading).toBeTruthy();
      expect(f.font_body).toBeTruthy();
      expect(f.font_url).toContain('fonts.googleapis.com');
    });
  });

  it('applyTheme sets CSS custom properties', () => {
    // jsdom has document.documentElement
    service.applyTheme(service.DEFAULT_THEME);
    const s = document.documentElement.style;
    expect(s.getPropertyValue('--bg')).toBe(service.DEFAULT_THEME.color_bg);
    expect(s.getPropertyValue('--ac')).toBe(service.DEFAULT_THEME.color_accent);
    expect(s.getPropertyValue('--r')).toBe(`${service.DEFAULT_THEME.radius_base}px`);
  });

  it('clearAppliedTheme releases legacy root variables and font link', () => {
    service.applyTheme(service.DEFAULT_THEME);
    expect(document.documentElement.style.getPropertyValue('--bg')).toBeTruthy();
    expect(document.getElementById('theme-font-link')).not.toBeNull();

    service.clearAppliedTheme();

    expect(document.documentElement.style.getPropertyValue('--bg')).toBe('');
    expect(document.documentElement.style.getPropertyValue('--font-body')).toBe('');
    expect(document.getElementById('theme-font-link')).toBeNull();
  });
});
