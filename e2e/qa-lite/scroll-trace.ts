import type { Page } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

type Trace = { name: string; checkpoints: unknown[] }
const traces = new WeakMap<Page, Trace>()

function sanitize(value: string) {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted-email]')
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[redacted-jwt]')
    .replace(/sb_(?:publishable|secret)_[A-Za-z0-9_-]+/g, '[redacted-key]')
}

export function beginAdminScrollTrace(page: Page, name: string) {
  traces.set(page, { name, checkpoints: [] })
}

export async function recordAdminScrollCheckpoint(page: Page, checkpoint: string) {
  const trace = traces.get(page)
  if (!trace) return
  const snapshot = await page.evaluate((label) => {
    const scrolling = document.scrollingElement
    const documentElement = document.documentElement
    const body = document.body
    const root = document.querySelector('.ag-root')
    const active = document.activeElement
    const activeText = active instanceof HTMLElement ? active.innerText : active?.textContent || ''
    const scrollingStyle = scrolling ? window.getComputedStyle(scrolling) : null
    return {
      checkpoint: label,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
      scrollingElementScrollTop: scrolling?.scrollTop ?? null,
      documentElementScrollTop: documentElement.scrollTop,
      bodyScrollTop: body?.scrollTop ?? null,
      documentElementTop: documentElement.getBoundingClientRect().top,
      adminRootTop: root?.getBoundingClientRect().top ?? null,
      scrollHeight: scrolling?.scrollHeight ?? null,
      clientHeight: scrolling?.clientHeight ?? null,
      activeElement: active ? {
        tag: active.tagName.toLowerCase(),
        id: active.id || null,
        class: active.getAttribute('class'),
        role: active.getAttribute('role'),
        text: active instanceof HTMLBodyElement
          ? null
          : activeText.replace(/\s+/g, ' ').trim().slice(0, 100),
      } : null,
      locationHash: window.location.hash,
      scrollingStyle: scrollingStyle ? {
        overflowY: scrollingStyle.overflowY,
        scrollBehavior: scrollingStyle.scrollBehavior,
        overflowAnchor: scrollingStyle.overflowAnchor,
      } : null,
    }
  }, checkpoint)
  trace.checkpoints.push(JSON.parse(sanitize(JSON.stringify(snapshot))))
}

export async function finishAdminScrollTrace(page: Page) {
  const trace = traces.get(page)
  if (!trace) return
  traces.delete(page)
  const artifactDir = process.env.QA_ARTIFACT_DIR
  const phase = process.env.QA_PHASE
  if (!artifactDir || !phase) throw new Error('QA_ARTIFACT_DIR y QA_PHASE son obligatorios para scroll trace')
  const path = join(artifactDir, phase, 'scroll', `${trace.name}.json`)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, JSON.stringify(trace.checkpoints, null, 2) + '\n', 'utf8')
}
