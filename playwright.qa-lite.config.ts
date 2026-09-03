import { defineConfig } from '@playwright/test'

const target = process.env.QA_TARGET_URL
if (!target) throw new Error('QA_TARGET_URL es obligatorio para DICO-QA-Lite')
const hostname = new URL(target).hostname
if (!['127.0.0.1', 'localhost'].includes(hostname)) {
  throw new Error(`DICO-QA-Lite rechazo target no local: ${hostname}`)
}
const motionInventoryOnly = process.env.QA_MOTION_INVENTORY_ONLY === '1'
// Captura de evidencia, no gate: corre a pedido y no engorda cada comparacion.
const sequenceOnly = process.env.QA_SEQUENCE_ONLY === '1'
// Un spec suelto, para diagnosticar sin pagar un compare completo de ~15min.
// No afecta al gate: si la variable no esta, el testMatch es el de siempre.
const specSuelto = (process.env.QA_SPEC || '').split(',').map((s) => s.trim()).filter(Boolean)

export default defineConfig({
  testDir: './e2e/qa-lite',
  testMatch: specSuelto.length ? specSuelto : sequenceOnly
    ? ['dico-physical-sequence.spec.ts', 'dico-sidebar.spec.ts', 'dico-physical-poses.spec.ts', 'dico-intervenciones.spec.ts']
    : motionInventoryOnly
    ? ['motion-inventory.spec.ts']
    : [
      'dom-parity.spec.ts',
      'visual-parity.spec.ts',
      'login-admin-race.spec.ts',
      'dico-native-message.spec.ts',
    ],
  // Presupuesto de RELOJ, no umbral de comparacion: subirlo no esconde ni un
  // pixel de diferencia, solo le da a las mismas comparaciones tiempo para
  // terminar en una maquina cargada. El default committeado sigue siendo 90s;
  // `QA_TEST_TIMEOUT_MS` existe para poder correr el gate sin tocar el
  // contrato cuando la maquina esta ocupada.
  timeout: Number(process.env.QA_TEST_TIMEOUT_MS) || 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: target,
    browserName: 'chromium',
    locale: 'es-AR',
    timezoneId: 'America/Argentina/Buenos_Aires',
    colorScheme: 'light',
    reducedMotion: 'reduce',
    deviceScaleFactor: 1,
    serviceWorkers: 'block',
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
})
