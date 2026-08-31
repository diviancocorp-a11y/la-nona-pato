import type { Page } from '@playwright/test'

export const COMPUTED_PROPERTIES = [
  'display', 'position', 'visibility', 'opacity',
  'top', 'right', 'bottom', 'left', 'width', 'height',
  'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'row-gap', 'column-gap',
  'font-family', 'font-size', 'font-style', 'font-weight', 'line-height', 'letter-spacing',
  'color', 'background-color', 'background-image',
  'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
  'border-top-style', 'border-right-style', 'border-bottom-style', 'border-left-style',
  'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
  'border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius',
  'outline-width', 'outline-style', 'outline-color', 'outline-offset',
  'box-shadow', 'transform', 'overflow-x', 'overflow-y', 'z-index',
  'align-items', 'align-content', 'align-self', 'justify-content', 'justify-items', 'justify-self',
  'grid-template-columns', 'grid-template-rows', 'grid-auto-flow',
  'flex-direction', 'flex-wrap', 'flex-grow', 'flex-shrink', 'flex-basis',
] as const

export async function collectDomContract(page: Page, rootSelector: string) {
  return page.locator(rootSelector).evaluate((root, properties) => {
    const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi
    const normalize = (value: unknown) => String(value ?? '')
      .replace(UUID, '<uuid>')
      .replace(/\s+/g, ' ')
      .trim()
    const round = (value: number) => Math.round(value * 64) / 64
    const pathOf = (element: Element) => {
      const parts: string[] = []
      let current: Element | null = element
      while (current) {
        if (current === root) { parts.unshift(':root'); break }
        const parent: Element | null = current.parentElement
        if (!parent) break
        const siblings = Array.from(parent.children).filter((child) => child.tagName === current?.tagName)
        parts.unshift(`${current.tagName.toLowerCase()}[${siblings.indexOf(current) + 1}]`)
        current = parent
      }
      return parts.join('>')
    }
    const stylesOf = (element: Element, pseudo?: string) => {
      const computed = getComputedStyle(element, pseudo)
      return Object.fromEntries((properties as readonly string[]).map((property) => [property, normalize(computed.getPropertyValue(property))]))
    }
    const elements = [root, ...Array.from(root.querySelectorAll('*'))]
      .filter((element) => !['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(element.tagName))
    return elements.map((element) => {
      const rect = element.getBoundingClientRect()
      const attrs = Object.fromEntries(Array.from(element.attributes)
        .filter((attribute) => !['value', 'srcdoc'].includes(attribute.name))
        .map((attribute) => [attribute.name, normalize(attribute.value)])
        .sort(([a], [b]) => a.localeCompare(b)))
      const directText = normalize(Array.from(element.childNodes)
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent).join(' '))
      const before = getComputedStyle(element, '::before')
      const after = getComputedStyle(element, '::after')
      const pseudo = (computed: CSSStyleDeclaration, name: string) => {
        const content = normalize(computed.content)
        return content && !['none', 'normal', '""'].includes(content)
          ? { name, content, styles: stylesOf(element, name) }
          : null
      }
      return {
        path: pathOf(element),
        tag: element.tagName.toLowerCase(),
        classes: Array.from(element.classList).sort(),
        attrs,
        directText,
        box: { x: round(rect.x), y: round(rect.y), width: round(rect.width), height: round(rect.height) },
        inlineStyle: normalize(element.getAttribute('style')),
        computed: stylesOf(element),
        pseudo: [pseudo(before, '::before'), pseudo(after, '::after')].filter(Boolean),
      }
    })
  }, COMPUTED_PROPERTIES)
}
