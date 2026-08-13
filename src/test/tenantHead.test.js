import { describe, it, expect, beforeEach } from 'vitest';
import { contrastOn, letterFavicon, applyTenantHead, applyCatalogTheme } from '../lib/tenantHead';

describe('tenantHead', () => {
  describe('contrastOn', () => {
    it('usa texto claro sobre fondo oscuro', () => {
      expect(contrastOn('#111111')).toBe('#ffffff');
      expect(contrastOn('#c91b14')).toBe('#ffffff'); // rojo Cochi
    });
    it('usa texto oscuro sobre fondo claro', () => {
      expect(contrastOn('#ffffff')).toBe('#111111');
      expect(contrastOn('#f5e6c8')).toBe('#111111');
    });
    it('cae a blanco si el color es invalido', () => {
      expect(contrastOn('rojo')).toBe('#ffffff');
      expect(contrastOn(null)).toBe('#ffffff');
      expect(contrastOn('#abc')).toBe('#ffffff');
    });
  });

  describe('letterFavicon', () => {
    it('genera un data URI de SVG', () => {
      expect(letterFavicon('C', '#c91b14')).toMatch(/^data:image\/svg\+xml,/);
    });
    it('usa la primera letra en mayuscula', () => {
      expect(decodeURIComponent(letterFavicon('cochi', '#c91b14'))).toContain('>C<');
    });
    it('cae a H sin letra', () => {
      expect(decodeURIComponent(letterFavicon('', '#111111'))).toContain('>H<');
    });
    it('ignora un color invalido en vez de romper el SVG', () => {
      const svg = decodeURIComponent(letterFavicon('M', 'javascript:alert(1)'));
      expect(svg).toContain('fill="#111111"');
      expect(svg).not.toContain('javascript:');
    });
    it('escapa la letra para no inyectar markup', () => {
      const svg = decodeURIComponent(letterFavicon('<', '#111111'));
      expect(svg).toContain('&lt;');
      expect(svg).not.toMatch(/><\/text>|<script/);
    });
  });

  describe('applyTenantHead', () => {
    beforeEach(() => {
      document.head.innerHTML = '<meta name="theme-color" content="#c91b14">';
      document.title = 'Cochi';
    });

    it('pone el nombre del tenant en el titulo', () => {
      applyTenantHead({ biz_name: 'Mala Miga', logo_color: '#8a5a2b', logo_letter: 'M' });
      expect(document.title).toBe('Mala Miga');
    });

    it('suma el slogan cuando existe', () => {
      applyTenantHead({ biz_name: 'Cochi', slogan: 'Que bien se cochina' });
      expect(document.title).toBe('Cochi — Que bien se cochina');
    });

    it('reescribe el theme-color al color del tenant', () => {
      applyTenantHead({ biz_name: 'Mala Miga', logo_color: '#8a5a2b' });
      const metas = [...document.head.querySelectorAll('meta[name="theme-color"]')];
      expect(metas.length).toBeGreaterThan(0);
      metas.forEach(m => expect(m.getAttribute('content')).toBe('#8a5a2b'));
    });

    it('pone favicon propio del tenant', () => {
      applyTenantHead({ biz_name: 'Mala Miga', logo_color: '#8a5a2b', logo_letter: 'M' });
      const icon = document.head.querySelector('link[rel="icon"]');
      expect(icon.getAttribute('href')).toMatch(/^data:image\/svg\+xml,/);
      expect(decodeURIComponent(icon.getAttribute('href'))).toContain('>M<');
    });

    it('prefiere el logo cargado por sobre la letra generada', () => {
      applyTenantHead({ biz_name: 'X', logo_url: 'https://cdn/logo.png' });
      expect(document.head.querySelector('link[rel="icon"]').getAttribute('href'))
        .toBe('https://cdn/logo.png');
    });

    it('apunta el manifest al tenant cuando hay slug', () => {
      applyTenantHead({ biz_name: 'Mala Miga', __slug: 'mala-miga' });
      expect(document.head.querySelector('link[rel="manifest"]').getAttribute('href'))
        .toBe('/api/manifest?slug=mala-miga');
    });

    it('no explota sin settings', () => {
      expect(() => applyTenantHead(null)).not.toThrow();
    });

    it('aplica el tema del tenant al body', () => {
      applyTenantHead({ biz_name: 'X', catalog_theme: 'noche' });
      expect(document.body.getAttribute('data-cp-theme')).toBe('noche');
    });
  });

  describe('applyCatalogTheme', () => {
    it('acepta los 3 temas validos', () => {
      for (const t of ['ambar', 'noche', 'carbon']) {
        expect(applyCatalogTheme(t)).toBe(t);
        expect(document.body.getAttribute('data-cp-theme')).toBe(t);
      }
    });

    it('cae a ambar con un tema invalido', () => {
      // El tema sale de un jsonb: un valor basura no puede dejar el
      // catalogo sin tokens de color.
      expect(applyCatalogTheme('neon')).toBe('ambar');
      expect(applyCatalogTheme(null)).toBe('ambar');
      expect(applyCatalogTheme(undefined)).toBe('ambar');
    });
  });
});
