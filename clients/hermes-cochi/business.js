// clients/hermes-cochi/business.js
// ═══════════════════════════════════════════════════════════════
// COCHI corriendo sobre el EDIFICIO (hermes-platform, multi-tenant).
// Misma identidad visual que clients/cochi, pero apunta a la DB unica.
//   platform: true  -> catalog.js usa el RPC get_catalog(slug) en vez de
//                      las queries directas a `recipes` del modelo viejo.
//   slug: 'cochi'    -> que tenant del edificio muestra este build.
// ═══════════════════════════════════════════════════════════════

const business = {
  // ── Plataforma (edificio multi-tenant) ─────────────────────
  platform: true,
  slug: 'cochi',

  // ── Core identity ──────────────────────────────────────────
  name: 'Cochi',
  shortName: 'Cochi',
  tagline: '¡Qué bien se cochina aquí!',
  description: 'Restaurante de cerdo y parrilla artesanal.',
  logoLetter: 'C',
  logoColor: '#c91b14',
  logoUrl: '/clients/cochi/logo-icon.jpg',
  logoHorizontalUrl: '/clients/cochi/logo-horizontal.jpg',
  logoWordmarkUrl: '/clients/cochi/logo-wordmark.jpg',

  address: { street: '', city: '', region: '', country: 'AR', postalCode: '' },
  geo: { lat: 10.4806, lng: -66.9036 },
  phone: '', whatsapp: '', email: '',
  website: '', instagram: '', facebook: '',
  cbu: '', aliasMp: '', cuit: '',

  branding: {
    mascotEmoji: '🐷',
    sound: '/oink.mp3',
    themeColorLight: '#c91b14',
    themeColorDark: '#221c1a',
    ogImage: '/og-image.png',
    accentColors: ['#c91b14', '#e3debe', '#221c1a', '#D84315', '#BF360C', '#4E342E', '#3E2723', '#FF5722', '#FF8A65', '#A1887F'],
    catalogBg: '#c91b14',
    catalogCardBg: '#FFFFFF',
    catalogHeaderBg: '#FFFFFF',
    catalogTextOnBg: '#FFFFFF',
    catalogStickyBg: 'rgba(201,27,20,0.95)',
    catalogStickyText: '#FFFFFF',
  },

  locale: 'es-AR',
  timezone: 'America/Argentina/Buenos_Aires',
  currency: 'ARS',
  currencySymbol: '$',

  type: 'grill',
  schemaOrgType: 'Restaurant',
  cuisines: ['Cerdo', 'Parrilla'],
  priceRange: '$$',

  hours: [
    { days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], opens: '11:00', closes: '22:00' },
    { days: ['Saturday', 'Sunday'], opens: '11:00', closes: '23:00' },
  ],

  defaultSettings: {
    biz_name: 'Cochi',
    logo_letter: 'C',
    logo_color: '#c91b14',
    cover_url: '',
    exp_cats: ['Materia Prima', 'Servicios', 'Packaging', 'Transporte', 'Alquiler', 'Equipamiento', 'Otros'],
    ing_cats: ['Carnes', 'Verduras', 'Condimentos', 'Bebidas', 'Packaging', 'Otros'],
    cat_images: {},
  },
  dailyDeals: {},
  fallbackProducts: [],
  fallbackCategoryGroups: [],

  legal: {
    privacyUrl: '/privacidad',
    termsUrl: '/terminos',
    copyrightHolder: 'Cochi',
    copyrightYear: 2026,
  },
};

export default business;

export function waLink(message = '') {
  const encoded = message ? `?text=${encodeURIComponent(message)}` : '';
  return `https://wa.me/${business.whatsapp}${encoded}`;
}
export function telLink() {
  return `tel:${business.phone}`;
}
export function fullName(withTagline = false) {
  return withTagline ? `${business.name} — ${business.tagline}` : business.name;
}
