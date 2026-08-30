import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { test } from './fixtures'
import {
  freezeContinuousDecorativeMotion, openAdmin, openCatalog, openPos, settleAdmin,
  localStatusFromEnv, DESKTOP, MOBILE,
} from './surfaces'
import { setCatalogTheme } from '../../platform/qa-lite/state.mjs'
import {
  beginAdminScrollTrace, finishAdminScrollTrace, recordAdminScrollCheckpoint,
} from './scroll-trace'

function outputRoot() {
  const root = process.env.QA_ARTIFACT_DIR
  const phase = process.env.QA_PHASE
  if (!root || !phase) throw new Error('QA_ARTIFACT_DIR y QA_PHASE son obligatorios')
  return join(root, phase, 'screenshots')
}

async function shot(page: import('@playwright/test').Page, name: string) {
  const root = outputRoot()
  await mkdir(root, { recursive: true })
  await freezeContinuousDecorativeMotion(page, {
    requireDicoMotion: name.startsWith('admin--'),
    surface: name,
  })
  if (name.startsWith('admin--')) await recordAdminScrollCheckpoint(page, 'before-screenshot')
  await page.screenshot({
    path: join(root, `${name}.png`),
    fullPage: false,
    caret: 'hide',
  })
  if (name.startsWith('admin--')) await finishAdminScrollTrace(page)
}

test('ocho screenshots bloqueantes', async ({ page }) => {
  const status = localStatusFromEnv()

  beginAdminScrollTrace(page, 'visual-01-admin-light')
  await openAdmin(page, 'light', DESKTOP)
  await settleAdmin(page)
  await shot(page, 'admin--light--1440x1000')
  beginAdminScrollTrace(page, 'visual-02-admin-dark')
  await openAdmin(page, 'dark', DESKTOP)
  await settleAdmin(page)
  await shot(page, 'admin--dark--1440x1000')
  await openPos(page, 'light', DESKTOP)
  await shot(page, 'pos--light--1440x1000')
  await openPos(page, 'dark', DESKTOP)
  await shot(page, 'pos--dark--1440x1000')
  await openPos(page, 'light', MOBILE)
  await shot(page, 'pos--light--390x844')

  try {
    for (const theme of ['ambar', 'noche', 'carbon'] as const) {
      await setCatalogTheme(theme, status)
      await openCatalog(page, theme)
      await shot(page, `catalog--${theme}--390x844`)
    }
  } finally {
    await setCatalogTheme('ambar', status)
  }
})
