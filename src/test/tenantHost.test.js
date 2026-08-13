import { describe, it, expect } from 'vitest';
import {
  normalizeHost, classifyHost, tenantSlugFromHost, isPlatformRoot,
  RESERVED_SUBDOMAINS,
} from '../lib/tenantHost';

describe('tenantHost', () => {
  describe('normalizeHost', () => {
    it('baja a minusculas y saca el puerto', () => {
      expect(normalizeHost('Cochi.Divianco.App:3000')).toBe('cochi.divianco.app');
    });
    it('tolera null/undefined/vacio', () => {
      expect(normalizeHost(null)).toBe('');
      expect(normalizeHost(undefined)).toBe('');
      expect(normalizeHost('  ')).toBe('');
    });
  });

  describe('subdominios de tenant', () => {
    it('extrae el slug', () => {
      expect(classifyHost('cochi.divianco.app')).toEqual({ kind: 'tenant', slug: 'cochi' });
    });
    it('acepta slugs con guiones', () => {
      expect(tenantSlugFromHost('la-nona-pato.divianco.app')).toBe('la-nona-pato');
    });
    it('ignora el puerto', () => {
      expect(tenantSlugFromHost('cochi.divianco.app:443')).toBe('cochi');
    });
  });

  describe('raiz de la plataforma', () => {
    it('el apex es raiz, no tenant', () => {
      expect(classifyHost('divianco.app')).toEqual({ kind: 'root', slug: null });
      expect(isPlatformRoot('divianco.app')).toBe(true);
    });
    it('www es la raiz, NO un tenant llamado www', () => {
      expect(classifyHost('www.divianco.app')).toEqual({ kind: 'root', slug: null });
      expect(tenantSlugFromHost('www.divianco.app')).toBeNull();
    });
  });

  describe('hosts que no son de la plataforma', () => {
    it('localhost cae en unknown (usa el slug del build)', () => {
      expect(classifyHost('localhost')).toEqual({ kind: 'unknown', slug: null });
    });
    it('las URLs de vercel.app caen en unknown', () => {
      expect(tenantSlugFromHost('hermes-platform-sigma.vercel.app')).toBeNull();
    });
    it('un dominio propio cae en unknown (lo resuelve la DB)', () => {
      expect(classifyHost('micomercio.com.ar')).toEqual({ kind: 'unknown', slug: null });
    });
  });

  describe('defensas', () => {
    it('no acepta subdominios multi-nivel', () => {
      // El cert wildcard no cubre *.*.divianco.app; ademas evita que
      // algo como "evil.cochi.divianco.app" se haga pasar por cochi.
      expect(tenantSlugFromHost('evil.cochi.divianco.app')).toBeNull();
    });

    it('ningun subdominio reservado resuelve como tenant', () => {
      for (const r of RESERVED_SUBDOMAINS) {
        expect(tenantSlugFromHost(`${r}.divianco.app`)).toBeNull();
      }
    });

    it('admin y api nunca son tenants', () => {
      expect(tenantSlugFromHost('admin.divianco.app')).toBeNull();
      expect(tenantSlugFromHost('api.divianco.app')).toBeNull();
    });

    it('un dominio parecido no se hace pasar por la plataforma', () => {
      // notdivianco.app termina distinto; divianco.app.evil.com no matchea.
      expect(tenantSlugFromHost('cochi.notdivianco.app')).toBeNull();
      expect(tenantSlugFromHost('divianco.app.evil.com')).toBeNull();
    });
  });
});
