import { makeTempDir } from './_test-temp.mjs'
/**
 * icon 语义门岗的自测：**先证明它会红**（R17），再证明它不乱红。
 *
 * 一道从没红过的门岗和一道不存在的门岗，在 CI 输出里长得一模一样。
 * 这里锁的是三条「长得像漂移、其实不是」的排除——它们是这道门岗唯一微妙的部分，
 * 一旦悄悄失效，门岗要么天天假红被人 --update-baseline 掉，要么漏掉真漂移。
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { conflictId, findConflicts, loadRegisteredIcons, scanButtonIconOverrides, scanIconDictionary, scanIconSemantics, scanIconTierViolations, scanUnnamedIconButtons } from './check-icon-semantics.mjs'

function fixture(files) {
  const dir = makeTempDir('icon-semantics-')
  for (const [name, content] of Object.entries(files)) {
    const file = path.join(dir, name)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, content)
  }
  return dir
}

const scan = (files) => findConflicts(scanIconSemantics(fixture(files), ['src']))

test('会红：同一动作在两处配了不同图标', () => {
  const conflicts = scan({
    'src/A.tsx': `import { IconLink } from '@tabler/icons-react'
export const A = () => <button aria-label={t('lib.paste')}><IconLink /></button>`,
    'src/B.tsx': `import { IconTrashX } from '@tabler/icons-react'
export const B = () => <button aria-label={t('lib.paste')}><IconTrashX /></button>`,
  })
  assert.equal(conflicts.length, 1)
  assert.equal(conflictId(conflicts[0]), 'lib.paste → IconLink/IconTrashX')
})

test('不乱红①：容器的 aria-label 不算动作身份（role=dialog + stopPropagation 的弹层）', () => {
  // 真实假红来源：TimelineTransitionPicker 的外壳 <div role="dialog" aria-label onClick>，
  // 一旦把它当控件，弹层里所有图标都会被算成「同一动作的多个图标」。
  const conflicts = scan({
    'src/P.tsx': `import { IconCheck, IconTrash } from '@tabler/icons-react'
export const P = () => (
  <div role="dialog" aria-label={t('picker.title')} onClick={(e) => e.stopPropagation()}>
    <button aria-label={t('picker.select')}><IconCheck /></button>
    <button aria-label={t('picker.remove')}><IconTrash /></button>
  </div>)`,
  })
  assert.deepEqual(conflicts, [])
})

test('不乱红②：同一三元里的两个图标是状态切换，不是漂移', () => {
  const conflicts = scan({
    'src/D.tsx': `import { IconDownload, IconLoader2 } from '@tabler/icons-react'
export const D = ({ busy }) => (
  <button aria-label={t('asset.download')}>{busy ? <IconLoader2 /> : <IconDownload />}</button>)`,
  })
  assert.deepEqual(conflicts, [])
})

test('不乱红③：chevron 这类示能图标不参与语义比对', () => {
  const conflicts = scan({
    'src/C.tsx': `import { IconChevronDown, IconVideo } from '@tabler/icons-react'
export const C = () => (
  <button aria-label={t('camera.move')}><IconVideo /><IconChevronDown /></button>)`,
  })
  assert.deepEqual(conflicts, [])
})

test('仍然会红：同一按钮里两个语义图标（不是示能、不是三元）', () => {
  const conflicts = scan({
    'src/E.tsx': `import { IconCube, IconMaximize } from '@tabler/icons-react'
export const E = () => (
  <button aria-label={t('scene.open')}><IconCube /><IconMaximize /></button>)`,
  })
  assert.equal(conflicts.length, 1)
})

/* ───────────── 规则二：图标词典登记（设计系统 §1.8 规则 5）的红/绿证明 ───────────── */

const dictionaryOf = (files) => [...scanIconDictionary(fixture(files), ['src']).keys()].sort()

test('会红：新图标不在词典基线、也没登记进 §6', () => {
  const icons = dictionaryOf({
    'src/A.tsx': `import { IconSquareX } from '@tabler/icons-react'
export const A = () => <button aria-label={t('panel.close')}><IconSquareX /></button>`,
  })
  const baseline = new Set(['IconX']) // 词典里已经有一个「关闭」
  const registered = new Set()
  assert.deepEqual(icons.filter((icon) => !baseline.has(icon) && !registered.has(icon)), ['IconSquareX'])
})

test('不乱红：登记进 §6「语义图标登记」表就放行', () => {
  const root = fixture({
    'src/A.tsx': `import { IconTrendingUp } from '@tabler/icons-react'
export const A = () => <button aria-label={t('ref.hot')}><IconTrendingUp /></button>`,
    'docs/design/nomi-design-system.md': `## 6. 图标使用规则

### 语义图标登记

| 语义 | 图标 | 用在哪 |
|---|---|---|
| 正在放量 | \`IconTrendingUp\` | FindReferencePanel |

### 选图规则
`,
  })
  const registered = loadRegisteredIcons(root)
  assert.ok(registered.has('IconTrendingUp'))
  const icons = [...scanIconDictionary(root, ['src']).keys()]
  assert.deepEqual(icons.filter((icon) => !registered.has(icon)), [])
})

test('不乱红：`import type { Icon }` 是类型不是词典里的词', () => {
  assert.deepEqual(
    dictionaryOf({
      'src/A.tsx': `import type { Icon } from '@tabler/icons-react'
export type Props = { icon: Icon }`,
    }),
    [],
  )
})

test('规则三 会红：原生 button 里只有图标、没有任何名字', () => {
  const found = scanUnnamedIconButtons(fixture({
    'src/A.tsx': `import { IconTrash } from '@tabler/icons-react'
export const A = () => <button type="button" onClick={go}><IconTrash size={14} /></button>`,
  }), ['src'])
  assert.deepEqual(Object.keys(found), ['src/A.tsx'])
})

test('规则三 不乱红：有 aria-label / title / 展开 props / 可见文字 / 三元图标带名字', () => {
  const found = scanUnnamedIconButtons(fixture({
    'src/A.tsx': `import { IconTrash, IconPlus, IconX } from '@tabler/icons-react'
export const A = (props) => <>
  <button aria-label={t('a.b')}><IconTrash /></button>
  <button title={t('a.b')}><IconTrash /></button>
  <button {...props}><IconTrash /></button>
  <button><IconPlus /> {t('a.add')}</button>
  <button aria-label="x">{open ? <IconX /> : <IconPlus />}</button>
</>`,
  }), ['src'])
  assert.deepEqual(found, {})
})

test('规则三 会红：三元两支都是图标也不豁免', () => {
  const found = scanUnnamedIconButtons(fixture({
    'src/A.tsx': `import { IconX, IconPlus } from '@tabler/icons-react'
export const A = () => <button>{open ? <IconX /> : <IconPlus />}</button>`,
  }), ['src'])
  assert.deepEqual(Object.keys(found), ['src/A.tsx'])
})

test('F1 会红：目标面写了四档之外的 size / stroke', () => {
  const root = fixture({
    'src/F1.tsx': `import { IconX } from '@tabler/icons-react'
export const F1 = () => <button><IconX size={17} stroke={1.7} /></button>`,
  })
  assert.deepEqual(scanIconTierViolations(root, ['src/F1.tsx']), [
    { file: 'src/F1.tsx', line: 2, icon: 'IconX', prop: 'size', value: 17 },
    { file: 'src/F1.tsx', line: 2, icon: 'IconX', prop: 'stroke', value: 1.7 },
  ])
})

test('F1 不乱红：四档数值通过，token 引用也通过', () => {
  const root = fixture({
    'src/F1.tsx': `import { IconX } from '@tabler/icons-react'
const tier = { size: 18, stroke: 1.8 }
export const F1 = () => <><IconX size={13} stroke={1.8} /><IconX size={tier.size} stroke={tier.stroke} /></>`,
  })
  assert.deepEqual(scanIconTierViolations(root, ['src/F1.tsx']), [])
})

/* ───────── 规则四：按钮说了算（2026-10-24）───────── */

const overrides = (files) => scanButtonIconOverrides(fixture(files), ['src'])
const kinds = (found) => Object.values(found).flat().map((hit) => `${hit.kind}:${hit.icon}`)

test('规则四会红：按钮的直接子图标自己传 size / stroke（穿过三元、&&、片段）', () => {
  const found = overrides({
    'src/A.tsx': `import { IconX, IconPlus, IconCheck } from '@tabler/icons-react'
import { WorkbenchButton, WorkbenchIconButton } from '../design'
export const A = ({ busy, ok }) => <>
  <WorkbenchButton><IconX size={13} />导出</WorkbenchButton>
  <WorkbenchButton>{busy ? null : <IconCheck stroke={1.8} />}</WorkbenchButton>
  <WorkbenchButton>{ok && <><IconPlus strokeWidth={2} /></>}</WorkbenchButton>
  <WorkbenchIconButton label="x" icon={busy ? <IconPlus width={18} /> : <IconX />} />
</>`,
  })
  assert.deepEqual(kinds(found), ['size-prop:IconX', 'size-prop:IconCheck', 'size-prop:IconPlus', 'size-prop:IconPlus'])
})

test('规则四会红：包一层只装一个图标的 span / div 绕开 [&>svg]（F1 第 1 轮的写法）', () => {
  const found = overrides({
    'src/A.tsx': `import { IconDownload } from '@tabler/icons-react'
import { WorkbenchButton, WorkbenchIconButton, ICON_TIER_CLASSES } from '../design'
export const A = () => <>
  <WorkbenchButton><span className={ICON_TIER_CLASSES.corner}><IconDownload /></span>导出</WorkbenchButton>
  <WorkbenchIconButton label="x" icon={<div className="contents"><IconDownload /></div>} />
</>`,
  })
  assert.deepEqual(kinds(found), ['wrapper:IconDownload', 'wrapper:IconDownload'])
})

test('规则四不乱红：给按钮传档位、按钮自己的 chevron、按钮外的裸图标、图标加角标的组合', () => {
  const found = overrides({
    'src/A.tsx': `import { IconX, IconListCheck, IconChevronDown } from '@tabler/icons-react'
import { WorkbenchButton, WorkbenchIconButton, ICON_TIERS } from '../design'
export const A = ({ n }) => <>
  <WorkbenchButton iconTier="bar"><IconListCheck aria-hidden="true" />{n}</WorkbenchButton>
  <WorkbenchButton iconTier="bar" chevron><IconX />布局</WorkbenchButton>
  <WorkbenchIconButton label="x" iconTier="corner" icon={<IconX />} />
  <button type="button" aria-label="x"><IconChevronDown size={ICON_TIERS.corner.size} stroke={ICON_TIERS.corner.stroke} /></button>
  <IconX size={24} />
  <WorkbenchButton><span className="relative"><IconX /><i className="dot" /></span></WorkbenchButton>
</>`,
  })
  assert.deepEqual(found, {})
})

// 「退回时要红」：拿 F1 现役文件真身做变异——把图标尺寸塞回按钮里，门岗必须当场认出来。
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const F1_BUTTON_HOSTS = [
  { file: 'src/ui/app-shell/shell/ShellTopBar.tsx', from: '<IconDownload />', to: '<IconDownload size={ICON_TIERS.corner.size} stroke={ICON_TIERS.corner.stroke} />' },
  { file: 'src/workbench/taskCenter/TaskCenterButton.tsx', from: '<IconListCheck aria-hidden="true" />', to: '<IconListCheck size={18} stroke={1.8} aria-hidden="true" />' },
  { file: 'src/workbench/preview/EditingLayoutMenu.tsx', from: '<IconLayoutDashboard />', to: '<span className="[&>svg]:size-[18px]"><IconLayoutDashboard /></span>' },
  { file: 'src/workbench/generationCanvas/nodes/NodeGenerationComposer.tsx', from: 'icon={<IconRefresh />}', to: 'icon={<IconRefresh size={14} stroke={2} />}' },
  { file: 'src/workbench/generationCanvas/nodes/NodeVideoControls.tsx', from: '<IconCamera />', to: '<IconCamera size={16} />' },
]

test('规则四守住 F1：现役按钮宿主零命中，且不在存量基线里', () => {
  const baseline = JSON.parse(fs.readFileSync(path.join(repoRoot, 'scripts/icon-semantics-baseline.json'), 'utf8')).buttonIconOverrides ?? {}
  for (const { file } of F1_BUTTON_HOSTS) {
    const root = fixture({ [file]: fs.readFileSync(path.join(repoRoot, file), 'utf8') })
    assert.deepEqual(scanButtonIconOverrides(root, ['src']), {}, `${file} 的按钮里还有图标自己定尺寸`)
    assert.equal(baseline[file], undefined, `${file} 不许进规则四的存量基线（F1 面要恒为 0）`)
  }
})

test('规则四退回时要红：把尺寸塞回 F1 按钮里（属性或包一层），逐个文件当场红', () => {
  for (const { file, from, to } of F1_BUTTON_HOSTS) {
    const source = fs.readFileSync(path.join(repoRoot, file), 'utf8')
    assert.ok(source.includes(from), `${file} 里找不到变异锚点 ${from}——现役写法改了就同步更新这张表`)
    const found = scanButtonIconOverrides(fixture({ [file]: source.replace(from, to) }), ['src'])
    assert.equal(Object.values(found).flat().length, 1, `${file} 退回后门岗没红`)
  }
})
