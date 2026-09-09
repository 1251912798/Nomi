/** Runs in the page. Describes rendered controls, not form values or hidden DOM. */
export function summarizeDom(config) {
  const visible = (el) => {
    const r = el.getBoundingClientRect(),
      s = getComputedStyle(el)
    return (
      s.visibility !== 'hidden' &&
      s.display !== 'none' &&
      Number(s.opacity) > 0 &&
      r.width > 0 &&
      r.height > 0 &&
      r.bottom > 0 &&
      r.right > 0 &&
      r.top < innerHeight &&
      r.left < innerWidth &&
      !el.closest('[aria-hidden=true], [inert]')
    )
  }
  const rect = (el) => {
    const r = el.getBoundingClientRect()
    return { x: r.x, y: r.y, width: r.width, height: r.height }
  }
  const identity = (el) =>
    el.id
      ? `#${el.id}`
      : [...el.attributes]
          .filter((a) => a.name.startsWith('data-') && a.value.length < 80)
          .slice(0, 3)
          .map((a) => `[${a.name}=${JSON.stringify(a.value)}]`)
          .join('') || el.tagName.toLowerCase()
  const text = (el) => (el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 300)
  const elements = [...document.querySelectorAll(config.dom.controls)].filter(visible)
  const controls = elements.map((el) => {
    const labelled = (el.getAttribute('aria-labelledby') || '')
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent || '')
      .join(' ')
      .trim()
    const label = el.matches('input,textarea,select,[contenteditable=true]') ? '' : text(el)
    const name =
      el.getAttribute('aria-label') ||
      labelled ||
      [...(el.labels || [])].map(text).join(' ') ||
      el.getAttribute('title') ||
      label
    return {
      target: identity(el),
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute('role'),
      text: label,
      accessibleName: name,
      placeholder: el.getAttribute('placeholder'),
      rect: rect(el),
      iconOnly: Boolean(el.querySelector('svg')) && !label,
      tooltipHint: Boolean(
        el.getAttribute('title') || el.getAttribute('aria-describedby') || el.getAttribute('data-tooltip'),
      ),
      disabled: Boolean(el.disabled),
      panel: el.closest(config.dom.panel) ? identity(el.closest(config.dom.panel)) : null,
    }
  })
  const rootStyle = getComputedStyle(document.documentElement)
  const tokenPattern = new RegExp(config.dom.gapTokenPattern)
  const tokens = [...rootStyle]
    .filter((name) => tokenPattern.test(name))
    .map((name) => ({ name, value: rootStyle.getPropertyValue(name).trim() }))
  const tokenPx = tokens
    .map((t) => /^([\d.]+)px$/.exec(t.value)?.[1])
    .filter(Boolean)
    .map(Number)
  const parents = [...new Set(elements.map((el) => el.parentElement))].filter(Boolean)
  const layout = parents.flatMap((parent) => {
    const s = getComputedStyle(parent)
    if (
      s.display !== 'flex' ||
      s.flexWrap !== 'nowrap' ||
      !['flex-start', 'flex-end', 'start', 'end'].includes(s.alignItems)
    )
      return []
    const children = [...parent.children].filter(visible)
    if (children.length < 2) return []
    const row = s.flexDirection === 'row',
      end = s.alignItems.endsWith('end')
    if (!row && s.flexDirection !== 'column') return []
    const edges = children.map((el) => {
      const r = el.getBoundingClientRect()
      return row ? (end ? r.bottom : r.top) : end ? r.right : r.left
    })
    const gap = Number.parseFloat(row ? s.columnGap : s.rowGap)
    return [
      {
        target: identity(parent),
        direction: s.flexDirection,
        alignment: s.alignItems,
        deviationPx: Math.max(...edges) - Math.min(...edges),
        gapPx: Number.isFinite(gap) ? gap : null,
        gapOnToken:
          !tokenPx.length || !Number.isFinite(gap) ? null : gap === 0 || tokenPx.some((t) => Math.abs(t - gap) <= 1),
      },
    ]
  })
  // Grid sampling measures union, so nested controls cannot inflate coverage above 100%.
  let covered = 0
  for (let y = 0; y < 30; y++)
    for (let x = 0; x < 40; x++) {
      const px = ((x + 0.5) * innerWidth) / 40,
        py = ((y + 0.5) * innerHeight) / 30
      if (
        controls.some(
          (c) => px >= c.rect.x && px < c.rect.x + c.rect.width && py >= c.rect.y && py < c.rect.y + c.rect.height,
        )
      )
        covered++
    }
  const visibleText = [...document.querySelectorAll('h1,h2,h3,label,p,[role=status],[role=alert]')]
    .filter(visible)
    .map((el) => ({ target: identity(el), text: text(el) }))
    .filter((e) => e.text)
  return {
    controls,
    visibleText,
    layout,
    gapTokens: tokens,
    controlCoverage: covered / 1200,
    primaryCandidates: [...document.querySelectorAll(config.dom.primary)].filter(visible).length,
    emptyHints: [...document.querySelectorAll(config.dom.empty)].filter(visible).length,
    panels: [...document.querySelectorAll(config.dom.panel)].filter(visible).map(identity),
    viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
    theme: document.documentElement.dataset.nomiColorScheme || document.documentElement.dataset.theme || 'unknown',
  }
}

/** Passive event probe. No click interception, no source or store imports. */
export function installProbe() {
  if (window.__experienceProbe) return
  const state = { events: [], longTasks: [], feedbackAt: null, start: performance.now() }
  window.__experienceProbe = state
  const targetRect = (el) => {
    const r = el.getBoundingClientRect()
    return { x: r.x, y: r.y, width: r.width, height: r.height }
  }
  for (const type of ['click', 'input', 'keydown', 'wheel', 'scroll'])
    document.addEventListener(
      type,
      (event) => {
        const el =
          event.target instanceof Element
            ? event.target.closest('button,a,input,textarea,select,[role=button],[contenteditable=true]') ||
              event.target
            : document.documentElement
        state.events.push({
          type,
          at: performance.now(),
          trusted: event.isTrusted,
          pointer: type === 'click' && event.detail > 0 ? { x: event.clientX, y: event.clientY } : null,
          rect: targetRect(el),
          key:
            type === 'keydown'
              ? ['Enter', 'Escape', 'Tab', 'ArrowUp', 'ArrowDown'].includes(event.key)
                ? event.key
                : 'other'
              : null,
          confirmation: type === 'click' && Boolean(el.closest('[role=dialog],[data-v4-block=intervention]')),
        })
      },
      { capture: true, passive: true },
    )
  if (PerformanceObserver.supportedEntryTypes.includes('longtask')) {
    const observer = new PerformanceObserver((list) =>
      state.longTasks.push(...list.getEntries().map((e) => ({ start: e.startTime, duration: e.duration }))),
    )
    observer.observe({ type: 'longtask', buffered: true })
    state.longTaskObserver = observer
  }
}
