import { flushSync } from 'react-dom'

/**
 * 「修饰键现在按着没」——以下一次真实输入事件自带的修饰位为准。全 App 唯一 owner。
 *
 * 为什么要它（2026-10-10 用户在 Mac 上报「点第二张卡变已选 2 个 · 编组、卡拖不动」）：
 * React Flow 的 selectionKeyCode / multiSelectionKeyCode（画布都配成 Shift）、zoomActivationKeyCode（默认 ⌘ / Ctrl），
 * 以及我们自己的几处「按着 X」状态，都是靠 keydown / keyup **成对**记的，只在窗口 blur 时清零。松开那一下只要没送到
 * document / window——macOS ⌘⇧4 截图把按键交给系统截图层、输入法吞键、或者 keyup 发生在一个 stopPropagation 的编辑区里
 * （文本节点正文、文本加工框、导演台、白板、创作编辑器都这么做）——它就永远以为键还按着：
 *   · Shift 卡住 → 点卡被当成「框选起手」吃掉（拖不动），零尺寸框又把脚下那张加进旧选择（点第二张就是两张）。
 *
 * 真相其实就在下一次输入事件上：pointerdown / mousedown / wheel / 任何 keydown 都带着操作系统盖的 shiftKey / metaKey /
 * ctrlKey / altKey。这里在 **window 捕获阶段**（全页最早、谁也拦不到它）看每一次按下：某个修饰键的按下我们见过、却没见过
 * 它的松开**完整送到 window 冒泡**（＝有人没收到），而这一次事件说它没按着——就替系统把那一下松开补发给 document，
 * 所有按 keyup 记账的监听（React Flow 的几个 useKeyPress、版本卡的 Alt、导演台飞行键）一次对齐。
 *
 * 补发包在 flushSync 里：React Flow 收到 keyup 后的 setState 与「多选开关」副作用在这一次按下继续往下传之前就提交，
 * 所以同一下点击里 Pane 读到的已经是「没按着」——不是下一下才好。
 *
 * 只补「松开」，不补「按下」：卡住的危害全在「以为按着」这一侧；「按着却没记上」（在别的窗口按下 Shift 再点回来）
 * 只是这一下不多选，用户松开重按即可，补发按下反而会凭空造出一次修饰键手势。
 */
export const RECONCILED_MODIFIERS = ['Shift', 'Meta', 'Control', 'Alt'] as const
export type ReconciledModifier = (typeof RECONCILED_MODIFIERS)[number]

const MODIFIER_FLAG: Record<ReconciledModifier, 'shiftKey' | 'metaKey' | 'ctrlKey' | 'altKey'> = {
  Shift: 'shiftKey',
  Meta: 'metaKey',
  Control: 'ctrlKey',
  Alt: 'altKey',
}
const MODIFIER_CODE: Record<ReconciledModifier, string> = {
  Shift: 'ShiftLeft',
  Meta: 'MetaLeft',
  Control: 'ControlLeft',
  Alt: 'AltLeft',
}
/**
 * 这几种事件都带修饰位。pointermove 也在里面而且最要紧：用户截完图、鼠标一挪，画布就先回到「没按着」的样子
 * （选中卡的连接把手、生成框重新出来），再去点——若只在按下那一刻对账，界面会在按下与松开之间变样，
 * 这一下点击就落到刚冒出来的把手上，而不是用户看见的那张卡（2026-10-10 走查实测）。
 * 没有待对账的键时每次只是一次 Set.size 判断。
 */
const RECONCILE_ON = ['pointermove', 'pointerdown', 'mousedown', 'wheel'] as const

type ModifierFlags = { shiftKey?: boolean; metaKey?: boolean; ctrlKey?: boolean; altKey?: boolean; key?: string }

function isReconciledModifier(key: unknown): key is ReconciledModifier {
  return typeof key === 'string' && (RECONCILED_MODIFIERS as readonly string[]).includes(key)
}

export type HeldModifierReconcilerOptions = {
  windowTarget?: EventTarget
  documentTarget?: EventTarget
  /** 让补发的 keyup 引起的 React 更新在本次按下继续传播前提交。 */
  flush?: (run: () => void) => void
  makeKeyup?: (key: ReconciledModifier) => Event
}

export function installHeldModifierReconciler(options: HeldModifierReconcilerOptions = {}): () => void {
  const windowTarget = options.windowTarget ?? window
  const documentTarget = options.documentTarget ?? document
  const flush = options.flush ?? ((run: () => void) => flushSync(run))
  const makeKeyup = options.makeKeyup
    ?? ((key: ReconciledModifier) => new KeyboardEvent('keyup', { key, code: MODIFIER_CODE[key], bubbles: true, cancelable: true }))
  /** 见过按下、还没见过松开完整送达 window 冒泡的修饰键。 */
  const unconfirmed = new Set<ReconciledModifier>()
  const synthetic = new WeakSet<Event>()

  const reconcile = (event: Event): void => {
    if (unconfirmed.size === 0 || synthetic.has(event)) return
    const flags = event as unknown as ModifierFlags
    const stale = [...unconfirmed].filter((modifier) => flags[MODIFIER_FLAG[modifier]] !== true)
    if (stale.length === 0) return
    for (const modifier of stale) unconfirmed.delete(modifier)
    flush(() => {
      for (const modifier of stale) {
        const keyup = makeKeyup(modifier)
        synthetic.add(keyup)
        documentTarget.dispatchEvent(keyup)
      }
    })
  }
  const onKeyDownCapture = (event: Event): void => {
    if (synthetic.has(event)) return
    const key = (event as unknown as ModifierFlags).key
    // 先对账别的修饰键（按 Shift 时 ⌘ 的修饰位也在这一下里），再记下这一个。
    reconcile(event)
    if (isReconciledModifier(key)) unconfirmed.add(key)
  }
  // 冒泡阶段：能走到这里说明一路没人 stopPropagation，document 上的监听也都收到了。
  const onKeyUpBubble = (event: Event): void => {
    const key = (event as unknown as ModifierFlags).key
    if (isReconciledModifier(key)) unconfirmed.delete(key)
  }
  const onBlur = (): void => unconfirmed.clear()

  windowTarget.addEventListener('keydown', onKeyDownCapture, true)
  windowTarget.addEventListener('keyup', onKeyUpBubble)
  // React Flow 自己在 window blur 时把所有键清零；这边同步忘掉，免得回来后对一个早已清掉的键再补一次。
  windowTarget.addEventListener('blur', onBlur)
  for (const type of RECONCILE_ON) windowTarget.addEventListener(type, reconcile, { capture: true, passive: true })
  return () => {
    windowTarget.removeEventListener('keydown', onKeyDownCapture, true)
    windowTarget.removeEventListener('keyup', onKeyUpBubble)
    windowTarget.removeEventListener('blur', onBlur)
    for (const type of RECONCILE_ON) windowTarget.removeEventListener(type, reconcile, { capture: true })
    unconfirmed.clear()
  }
}
