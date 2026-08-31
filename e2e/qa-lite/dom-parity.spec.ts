import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { test } from './fixtures'
import { collectDomContract } from './contract'
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
  return join(root, phase, 'dom')
}

async function save(name: string, value: unknown) {
  const root = outputRoot()
  await mkdir(root, { recursive: true })
  await writeFile(join(root, `${name}.json`), JSON.stringify(value, null, 2) + '\n', 'utf8')
}

async function captureContract(
  page: import('@playwright/test').Page,
  name: string,
  selector: string,
) {
  await freezeContinuousDecorativeMotion(page, {
    requireDicoMotion: name.startsWith('admin--') || name.startsWith('pos--'),
    surface: name,
  })
  if (name.startsWith('admin--')) await recordAdminScrollCheckpoint(page, 'before-dom-contract')
  await save(name, await collectDomContract(page, selector))
  if (name.startsWith('admin--')) await finishAdminScrollTrace(page)
}

test('contrato DOM/computed/layout de las ocho superficies', async ({ page }) => {
  const status = localStatusFromEnv()

  beginAdminScrollTrace(page, 'dom-01-admin-light')
  const adminLight = await openAdmin(page, 'light', DESKTOP)
  await settleAdmin(page)
  await captureContract(page, 'admin--light--1440x1000', adminLight)
  beginAdminScrollTrace(page, 'dom-02-admin-dark')
  const adminDark = await openAdmin(page, 'dark', DESKTOP)
  await settleAdmin(page)
  await captureContract(page, 'admin--dark--1440x1000', adminDark)
  await captureContract(page, 'pos--light--1440x1000', await openPos(page, 'light', DESKTOP))
  await captureContract(page, 'pos--dark--1440x1000', await openPos(page, 'dark', DESKTOP))
  await captureContract(page, 'pos--light--390x844', await openPos(page, 'light', MOBILE))

  try {
    for (const theme of ['ambar', 'noche', 'carbon'] as const) {
      await setCatalogTheme(theme, status)
      const selector = await openCatalog(page, theme)
      await captureContract(page, `catalog--${theme}--390x844`, selector)
    }
  } finally {
    await setCatalogTheme('ambar', status)
  }
})
