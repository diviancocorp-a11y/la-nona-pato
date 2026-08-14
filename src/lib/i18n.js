// src/lib/i18n.js
// i18next configuration for the Dico platform.
// Default language: es-AR. Prepared for es-MX, es-CL, pt-BR, en-US.
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import esAR from '../locales/es-AR/common.json';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      'es-AR': { translation: esAR },
      // Future locales:
      // 'es-MX': { translation: esMX },
      // 'es-CL': { translation: esCL },
      // 'pt-BR': { translation: ptBR },
      // 'en-US': { translation: enUS },
    },
    fallbackLng: 'es-AR',
    supportedLngs: ['es-AR', 'es-MX', 'es-CL', 'pt-BR', 'en-US'],

    interpolation: {
      escapeValue: false, // React already escapes
      format(value, format) {
        if (format === 'number' && typeof value === 'number') {
          return new Intl.NumberFormat(i18n.language).format(value);
        }
        if (format === 'currency' && typeof value === 'number') {
          return new Intl.NumberFormat(i18n.language, {
            style: 'currency',
            currency: 'ARS',
            minimumFractionDigits: 0,
          }).format(value);
        }
        if (format === 'datetime' && value instanceof Date) {
          return new Intl.DateTimeFormat(i18n.language).format(value);
        }
        return value;
      },
    },

    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'hermes-lang',
      caches: ['localStorage'],
    },
  });

export default i18n;

/**
 * Change language and persist to localStorage.
 * @param {string} lng - e.g. 'es-AR', 'en-US'
 */
export function changeLanguage(lng) {
  return i18n.changeLanguage(lng);
}

/** Available locales with display names */
export const AVAILABLE_LOCALES = [
  { code: 'es-AR', name: 'Español (Argentina)' },
  // { code: 'es-MX', name: 'Español (México)' },
  // { code: 'es-CL', name: 'Español (Chile)' },
  // { code: 'pt-BR', name: 'Português (Brasil)' },
  // { code: 'en-US', name: 'English (US)' },
];
