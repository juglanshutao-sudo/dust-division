import { t, uiLanguage } from './language'

// Capture the authored English strings once, before the first localized render.
export function bindShellCopy(root: HTMLElement) {
  const labels = Array.from(root.querySelectorAll<HTMLElement>('[data-copy]'), (node) => ({
    node,
    source: node.textContent?.trim() ?? '',
  }))
  const attributes = ['title', 'aria-label'] as const
  const controls = Array.from(root.querySelectorAll<HTMLElement>('[title],[aria-label]')).flatMap((node) =>
    attributes.flatMap((attribute) => {
      const source = node.getAttribute(attribute)
      return source ? [{ node, attribute, source }] : []
    }),
  )
  return () => {
    for (const { node, source } of labels) node.textContent = t(source)
    for (const { node, attribute, source } of controls) {
      // Switching to Canvas 2D can replace the focusable world canvas.
      const target = node.isConnected ? node : node.id ? document.getElementById(node.id) : null
      target?.setAttribute(attribute, t(source))
    }
    document.title = uiLanguage() === 'zh-CN' ? '尘域分部 — 灰烬荒原' : 'Dust Division — The Ashline Expanse'
  }
}
