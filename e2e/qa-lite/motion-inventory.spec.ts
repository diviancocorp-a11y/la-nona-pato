import { test } from './fixtures'
import {
  DESKTOP, inventoryAdminInfiniteMotion, inventoryCatalogInfiniteMotion,
  freezeContinuousDecorativeMotion, localStatusFromEnv, openAdmin, openCatalog, settleAdmin,
} from './surfaces'
import { setCatalogTheme } from '../../platform/qa-lite/state.mjs'

test('inventario de motion infinito en Admin y Catalogo', async ({ page }) => {
  for (const theme of ['light', 'dark'] as const) {
    await openAdmin(page, theme, DESKTOP)
    await settleAdmin(page)
    await inventoryAdminInfiniteMotion(page, `admin--${theme}--1440x1000`)
    await freezeContinuousDecorativeMotion(page, {
      requireDicoMotion: true,
      surface: `admin--${theme}--1440x1000`,
    })
  }

  const status = localStatusFromEnv()
  try {
    for (const theme of ['ambar', 'noche', 'carbon'] as const) {
      await setCatalogTheme(theme, status)
      await openCatalog(page, theme)
      await inventoryCatalogInfiniteMotion(page, `catalog--${theme}--390x844`)
    }
  } finally {
    await setCatalogTheme('ambar', status)
  }
})
