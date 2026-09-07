import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import React from 'react'
import '../../../../i18n'
import ArtifactBody from './ArtifactBody'
import { withArtifactSandboxPolicy } from './artifactSandboxDocument'
import { LOCAL_ARTIFACT_CONTENT_SECURITY_POLICY } from '../../../../../electron/shared/localArtifactPolicy'
import { canArtifactCopyText } from '../../model/artifactMeta'
import type { AgentArtifactMeta } from '../../model/artifactMeta'
import type { GenerationCanvasNode } from '../../model/generationCanvasTypes'

// 真实产物落地契约测试（component-level, server-render）：
// 不依赖 Electron / 浏览器 / 沙箱环境，毫秒级、CI 稳定。
// 走查用脚本在 tests/ux/agent-artifact.walk.mjs（P1 · deliver_craft 落盘 + Nomi 主窗引导跳过路径修复后启用）。
//
// 注意：Model3DViewer 是 R3F 组件，server-render 会抛；这里只断言非 3D 子视图，glb 走 GUI 走查。

const makeNode = (id: string): GenerationCanvasNode => ({
  id,
  kind: 'agent-artifact',
  title: '开场构图线稿',
  categoryId: 'shots',
  position: { x: 0, y: 0 },
  meta: {},
})

const baseProps = (artifact: AgentArtifactMeta) => ({
  node: makeNode('test'),
  artifact,
  width: 320,
  height: 240,
})

describe('ArtifactBody · 真实产物渲染契约', () => {
  it('SVG：内嵌 <img> 指向 nomi-local 资产 URL', () => {
    const html = renderToStaticMarkup(
      React.createElement(ArtifactBody, baseProps({
        fileType: 'svg',
        url: 'nomi-local://asset/p/assets/generated/composition-guide.svg',
      })),
    )
    expect(html).toContain('nomi-local://asset/p/assets/generated/composition-guide.svg')
    expect(html).toContain('<img')
  })

  // HTML 产物走 srcdoc（不是 src 导航——跨源隔离下那条路一律被挡，见 artifactSandboxDocument 头注），
  // 所以 server-render 阶段只出加载态；iframe 属性与「真的跑起来了」由走查在真机上证。
  it('HTML：server-render 先出加载态（产物文本在 effect 里取）', () => {
    const html = renderToStaticMarkup(
      React.createElement(ArtifactBody, baseProps({
        fileType: 'html',
        url: 'nomi-local://asset/p/assets/generated/opening-beats.html',
      })),
    )
    expect(html).toContain('data-artifact-file-type="html"')
    expect(html).not.toContain('allow-same-origin')
  })

  // ⚠️ 这三条原先只断 `html.length > 0`——那对任何非空输出都成立，等于没断。
  // 真正该锁的是「壳认得出这是哪种产物」：类型标记 + 类型角标 + 标题（样张的 n-head）。
  it.each([
    ['markdown', 'Markdown', 'nomi-local://asset/p/assets/generated/notes.md'],
    ['table', '表格', 'nomi-local://asset/p/assets/generated/storyboard.html'],
    ['text', '文本', 'nomi-local://asset/p/assets/generated/script.txt'],
    ['svg', 'SVG', 'nomi-local://asset/p/assets/generated/composition-guide.svg'],
    ['html', 'HTML', 'nomi-local://asset/p/assets/generated/opening-beats.html'],
  ] as const)('%s：壳标出类型 + 角标文本 + 标题', (fileType, chip, url) => {
    const html = renderToStaticMarkup(React.createElement(ArtifactBody, baseProps({ fileType, url })))
    expect(html).toContain(`data-artifact-file-type="${fileType}"`)
    expect(html, '类型角标（没有它，手绘线稿和生图在画布上长得一样）').toContain(chip)
    expect(html, '标题（没有它，一批产物落下来只能靠内容认）').toContain('开场构图线稿')
  })

  // ── 诚实标注（2026-09-07 用户拍板：按现状合并，界面上明标「暂不支持交互」）。
  // HTML 产物的 CSS 真的在跑，卡面看起来是活的，用户会伸手去点——但内联 JS 被宿主 CSP 拦
  // （srcdoc 继承宿主策略，方案 §6.5）。标注是这个缺口在界面上的唯一说话方式，所以它
  // **必须只在 html 出现**：漏了 html = 用户自己撞；串到别的类型 = 平白说了句不成立的限制。
  it('HTML 产物卡带「暂不支持点击交互」标注（缺口明着标，不让用户自己撞）', () => {
    const html = renderToStaticMarkup(
      React.createElement(ArtifactBody, baseProps({
        fileType: 'html',
        url: 'nomi-local://asset/p/assets/generated/opening-beats.html',
      })),
    )
    expect(html).toContain('data-artifact-interaction-note="true"')
    expect(html, '标注读的是 i18n 词条，不是硬编码文案').toContain('可动，暂不支持点击交互')
  })

  it.each(['svg', 'markdown', 'table', 'text'] as const)(
    '%s 产物卡没有交互标注（它们本来就不是活内容，标了是噪音）',
    (fileType) => {
      const html = renderToStaticMarkup(
        React.createElement(ArtifactBody, baseProps({ fileType, url: `nomi-local://asset/p/assets/generated/x.${fileType}` })),
      )
      expect(html).not.toContain('data-artifact-interaction-note')
      expect(html).not.toContain('暂不支持点击交互')
    },
  )
})

describe('canArtifactCopyText · 浮条「复制」按钮可见性谓词', () => {
  it('text / markdown / html 可复制；svg / table / glb 不可复制', () => {
    expect(canArtifactCopyText('text')).toBe(true)
    expect(canArtifactCopyText('markdown')).toBe(true)
    expect(canArtifactCopyText('html')).toBe(true)
    expect(canArtifactCopyText('svg')).toBe(false)
    expect(canArtifactCopyText('table')).toBe(false)
    expect(canArtifactCopyText('glb')).toBe(false)
  })
})

describe('withArtifactSandboxPolicy · 策略必须写进文档、且写在最前面', () => {
  const policy = "default-src 'none'; connect-src 'none'"

  it('有 <head>：紧跟其后插入（meta CSP 只管住它后面的内容，插晚了等于没插）', () => {
    const out = withArtifactSandboxPolicy('<!doctype html><html><head><title>x</title></head><body>hi</body></html>', policy)
    expect(out).toContain(`<head><meta http-equiv="Content-Security-Policy" content="${policy}">`)
    expect(out.indexOf('Content-Security-Policy')).toBeLessThan(out.indexOf('<title>'))
  })

  it('只有 <html> 没有 <head>：补一个 head 放进去', () => {
    const out = withArtifactSandboxPolicy('<html><body>hi</body></html>', policy)
    expect(out).toContain('<html><head><meta http-equiv="Content-Security-Policy"')
    expect(out.indexOf('Content-Security-Policy')).toBeLessThan(out.indexOf('<body>'))
  })

  it('裸片段：放最前面', () => {
    const out = withArtifactSandboxPolicy('<div class="bar"></div>', policy)
    expect(out.startsWith('<meta http-equiv="Content-Security-Policy"')).toBe(true)
  })

  it('有 doctype 但没有 html/head：让过 doctype（插它前面会掉进怪异模式）', () => {
    const out = withArtifactSandboxPolicy('<!doctype html><div>hi</div>', policy)
    expect(out.startsWith('<!doctype html><meta http-equiv=')).toBe(true)
  })

  it('策略里的引号被转义，产物无法用一个引号提前闭合 content 属性逃出笼子', () => {
    const out = withArtifactSandboxPolicy('<html><head></head><body></body></html>', `default-src 'none'; report-to "x"`)
    expect(out).toContain('&quot;x&quot;')
    expect(out).not.toContain('content="default-src \'none\'; report-to "x""')
  })

  // 默认参数就是那份唯一定义——不许在渲染层另写一份"差不多"的策略。
  it('默认用 electron/shared 的那份定义，不另起一份', () => {
    const out = withArtifactSandboxPolicy('<html><head></head></html>')
    expect(out).toContain(LOCAL_ARTIFACT_CONTENT_SECURITY_POLICY.replace(/"/g, '&quot;'))
  })
})
