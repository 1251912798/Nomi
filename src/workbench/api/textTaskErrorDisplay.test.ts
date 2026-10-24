// D7（协调 10-21 定：先写测试证实，再在本 PR 修，不加新文案）。
//
// 文本任务的错误经 IPC 过来时带着结构化标记（`NOMI_VENDOR_ERR_B64::<base64>:: 人话`）：文本节点的错误卡用
// classifyError 读它、剥掉它再给人看。可提示词优化、翻译、AI 起草脚本这三处直接把 `e.message` 摆上界面，
// 服务商一报错，用户看到的就是一长串 base64。这里证两件事：
//   ① 真实的那句错误（主进程真编出来的标记串）经这三处的展示函数后，不再含标记、仍带服务商原话；
//   ② 三个组件的 catch 都走这一个展示函数（结构上不许再有第四种「直接摆 e.message」的写法）。
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { VendorRequestError, encodeVendorErrorMessage } from '../../../electron/vendor/vendorHttp'
import { textTaskFailureText } from './taskApi'

const repoRoot = path.resolve(__dirname, '../../..')
const markerMessage = encodeVendorErrorMessage(new VendorRequestError('（HTTP 429）Too many requests, slow down', {
  vendorKey: 'relay', method: 'POST', url: 'https://relay.example.test/v1/chat/completions', httpStatus: 429,
  upstreamMsg: 'Too many requests, slow down', category: 'quota', retryable: true,
}))

describe('文本任务错误给人看的那一句', () => {
  it('结构化标记被剥掉，服务商原话留着', () => {
    expect(markerMessage).toContain('NOMI_VENDOR_ERR_B64::')
    const shown = textTaskFailureText(new Error(markerMessage))
    expect(shown).not.toContain('NOMI_VENDOR_ERR_B64')
    expect(shown).toBe('（HTTP 429）Too many requests, slow down')
  })

  it('没有标记的错误原样；不是 Error 的给空串（调用方用自己的兜底文案）', () => {
    expect(textTaskFailureText(new Error('relay upstream failed'))).toBe('relay upstream failed')
    expect(textTaskFailureText('boom')).toBe('')
  })

  it.each([
    'src/workbench/generationCanvas/nodes/NodePromptOptimizer.tsx',
    'src/workbench/generationCanvas/nodes/NodePromptTranslator.tsx',
    'src/ui/onboarding/CustomCallEditor.tsx',
    'src/workbench/creation/aiRewrite/rewriteModel.ts',
  ])('%s 的文本任务错误走 textTaskFailureText，不直接摆 e.message', (file) => {
    const source = readFileSync(path.join(repoRoot, file), 'utf8')
    expect(source).toContain('textTaskFailureText(')
    // 文本任务那一处 catch 的旧写法（三处各一种拼法）。
    expect(source).not.toMatch(/setError\(e instanceof Error \? e\.message|reason: e\.message|setAiError\(e instanceof Error \? e\.message/)
  })
})
