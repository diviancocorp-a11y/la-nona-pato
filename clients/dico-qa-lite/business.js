// Cliente de build exclusivo para DICO-QA-Lite.
// No habilita rutas ni flags de runtime: solo fija el tenant sintetico que
// ambos commits usan durante la comparacion local.

const business = {
  platform: true,
  slug: 'dico-qa-lite',

  name: 'Dico QA Lite',
  shortName: 'Dico QA',
  tagline: 'Fixture local determinista',
  description: 'Entorno local sintetico para verificar neutralidad visual.',
  logoLetter: 'D',
  logoColor: '#C45D3E',
  logoUrl: '',
  logoHorizontalUrl: '',
  logoWordmarkUrl: '',

  address: { street: 'Calle QA 100', city: 'Buenos Aires', region: 'CABA', country: 'AR', postalCode: '1000' },
  geo: { lat: -34.6037, lng: -58.3816 },
  phone: '', whatsapp: '', email: '',
  website: '', instagram: '', facebook: '',
  cbu: '', aliasMp: '', cuit: '',

  branding: {
    mascotEmoji: '',
    sound: '',
    themeColorLight: '#C45D3E',
    themeColorDark: '#171513',
    ogImage: '',
    accentColors: ['#C45D3E'],
    catalogBg: '#C45D3E',
    catalogCardBg: '#FFFFFF',
    catalogHeaderBg: '#FFFFFF',
    catalogTextOnBg: '#FFFFFF',
    catalogStickyBg: 'rgba(196,93,62,0.95)',
    catalogStickyText: '#FFFFFF',
  },

  locale: 'es-AR',
  timezone: 'America/Argentina/Buenos_Aires',
  currency: 'ARS',
  currencySymbol: '$',
  type: 'restaurant',
  schemaOrgType: 'Restaurant',
  cuisines: ['Fixture'],
  priceRange: '$$',
  hours: [
    { days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'], opens: '09:00', closes: '23:00' },
  ],
  defaultSettings: {
    biz_name: 'Dico QA Lite',
    logo_letter: 'D',
    logo_color: '#C45D3E',
    cover_url: '',
    exp_cats: ['Insumos', 'Servicios'],
    ing_cats: ['Comida', 'Bebidas'],
    cat_images: {},
  },
  dailyDeals: {},
  fallbackProducts: [],
  fallbackCategoryGroups: [],
  legal: {
    privacyUrl: '/privacidad',
    termsUrl: '/terminos',
    copyrightHolder: 'Divianco',
    copyrightYear: 2026,
  },
};

export default business;

export function waLink(message = '') {
  const encoded = message ? `?text=${encodeURIComponent(message)}` : '';
  return `https://wa.me/${business.whatsapp}${encoded}`;
}
export function telLink() { return `tel:${business.phone}`; }
export function fullName(withTagline = false) {
  return withTagline ? `${business.name} — ${business.tagline}` : business.name;
}
