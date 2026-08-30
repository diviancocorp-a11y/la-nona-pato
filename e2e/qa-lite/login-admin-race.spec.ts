import { test, expect } from '@playwright/test'
import { loginAdmin } from './surfaces'

const PAGE_URL = 'http://127.0.0.1:43991/admin-race'
const AUTH_URL = 'http://127.0.0.1:54321/auth/v1/token?grant_type=password'

test('login form appears asynchronously after navigation', async ({ page }) => {
  const previousEmail = process.env.QA_ADMIN_EMAIL
  const previousPassword = process.env.QA_ADMIN_PASSWORD
  process.env.QA_ADMIN_EMAIL = 'owner@qa-lite.local'
  process.env.QA_ADMIN_PASSWORD = 'qa-lite-password'
  let authRequests = 0

  try {
    await page.route(PAGE_URL, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body: `<!doctype html>
          <html>
            <body>
              <main id="app"></main>
              <script>
                setTimeout(() => {
                  document.querySelector('#app').innerHTML = \`
                    <form>
                      <input type="email" required>
                      <input type="password" required>
                      <button type="submit">Entrar</button>
                    </form>
                  \`
                  document.querySelector('form').addEventListener('submit', async (event) => {
                    event.preventDefault()
                    await fetch('${AUTH_URL}', { method: 'POST', body: 'password-login' })
                    document.querySelector('#app').innerHTML = '<main class="ag-root">Admin listo</main>'
                  })
                }, 100)
              </script>
            </body>
          </html>`,
      })
    })
    await page.route(AUTH_URL, async (route) => {
      authRequests += 1
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: '{}',
      })
    })

    await page.goto(PAGE_URL)
    await loginAdmin(page)

    await expect(page.locator('.ag-root')).toBeVisible()
    expect(authRequests).toBe(1)
  } finally {
    if (previousEmail === undefined) delete process.env.QA_ADMIN_EMAIL
    else process.env.QA_ADMIN_EMAIL = previousEmail
    if (previousPassword === undefined) delete process.env.QA_ADMIN_PASSWORD
    else process.env.QA_ADMIN_PASSWORD = previousPassword
  }
})
