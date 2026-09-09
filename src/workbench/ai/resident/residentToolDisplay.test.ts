import { describe, expect, it } from 'vitest'
import {
  humanizeToolFailure,
  proposalForTool,
  readableToolDetailRows,
  isReadOnlyToolName,
  readableToolName,
  readableToolPreview,
  readableToolSummary,
} from './residentToolDisplay'
import { redactToolArguments } from './residentToolText'
import { partitionResidentProposalFields } from './residentProposalDisplay'
import { CAPABILITY_ALIAS_ENTRIES, CAPABILITY_CONTRACTS } from '../../../../electron/shared/agentCapabilities/registry'
import { modelFacingToolSpecs } from '../../../../electron/shared/agentCapabilities/modelFacingToolRegistry'

const translate = (key: string, options?: Record<string, unknown>): string => {
  if (!options) return key
  return `${key}(${Object.entries(options).map(([name, value]) => `${name}=${String(value)}`).join(',')})`
}

describe('resident tool display projection', () => {
  it('names every current lane tool and preserves operation-specific effects', () => {
    expect(modelFacingToolSpecs('internal').filter(spec => readableToolName(translate, spec.name) === 'agentResident.toolGeneric')
      .map(spec => spec.name)).toEqual([])
    expect(readableToolName(translate, 'nomi_canvas_write', { operation: 'create_canvas_nodes' })).toBe('agentResident.toolCanvasWrite')
    expect(readableToolName(translate, 'nomi_storyboard_write', { operation: 'patch_shots' })).toBe('agentResident.toolStoryboardWrite')
    expect(readableToolSummary(translate, 'nomi_canvas_write', { operation: 'create_canvas_nodes' })).toContain('agentResident.toolNoGeneration')
    expect(isReadOnlyToolName('read_full_text')).toBe(true)
    expect(readableToolName(translate, 'nomi_request_tools')).toBe('agentResident.toolPrepareTools')
  })

  it('keeps the first layer compact while retaining generation intent', () => {
    const args = { prompt: 'a small cat avatar', modelId: 'provider/image-fast', parameters: { aspectRatio: '1:1', quality: 'standard' } }
    expect(readableToolPreview(translate, 'nomi_start_generation', args)).toBe('agentResident.toolGenerationSummary')
    expect(readableToolSummary(translate, 'nomi_start_generation', args)).toContain('a small cat avatar')
    expect(readableToolSummary(translate, 'nomi_start_generation', args)).toContain('provider/image-fast')
  })

  it('describes read-only calls and storyboard proposals without claiming canvas changes', () => {
    expect(readableToolSummary(translate, 'read_full_text', {})).toBe('agentResident.toolReadNoChange')
    for (const operation of ['propose_storyboard_plan', 'patch_shots']) {
      const args = { operation, shots: [{ index: 1, prompt: 'Opening' }] }
      expect(readableToolName(translate, 'nomi_storyboard_write', args)).toBe('agentResident.toolStoryboardWrite')
      expect(readableToolSummary(translate, 'nomi_storyboard_write', args)).toBe('agentResident.toolStoryboardWriteSummary')
      expect(readableToolPreview(translate, 'nomi_storyboard_write', args)).toBe('agentResident.toolShotCount(count=1)')
      const proposal = proposalForTool(translate, 'nomi_storyboard_write', args)
      expect(proposal?.fields.find(field => field.kind === 'boundary')?.value).toBe('agentResident.toolStoryboardWriteSummary')
      expect(proposal?.fields.find(field => field.kind === 'prompt')?.value).toBe('Opening')
    }
  })

  it('names every registered capability and every surface alias of it, derived from the registry', () => {
    // Class-level, not a spot check. Both lists come from the registry, so a new capability — or a
    // rename of any pi/MCP alias — fails here instead of silently rendering as the generic "工具" in
    // the tool chips and, since the approval card titles itself with this string, on the card a human
    // is asked to approve. Neither list is ever hand-copied.
    const unnamedContracts = CAPABILITY_CONTRACTS
      .map((contract) => contract.id)
      .filter((id) => readableToolName(translate, id) === 'agentResident.toolGeneric')
    expect(unnamedContracts).toEqual([])

    const unnamedAliases = CAPABILITY_ALIAS_ENTRIES
      .filter((entry) => readableToolName(translate, entry.alias) === 'agentResident.toolGeneric')
      .map((entry) => `${entry.surface}:${entry.alias}`)
    expect(unnamedAliases).toEqual([])

    expect(CAPABILITY_CONTRACTS.length).toBeGreaterThan(10)
    expect(CAPABILITY_ALIAS_ENTRIES.length).toBeGreaterThan(CAPABILITY_CONTRACTS.length)
  })

  it('trusts the registry over the words in an alias', () => {
    // `propose_edit_plan` belongs to timeline.read; word-matching sees "edit" and calls it a write.
    expect(isReadOnlyToolName('propose_edit_plan')).toBe(true)
    expect(isReadOnlyToolName('apply_edit_plan')).toBe(false)
    expect(readableToolName(translate, 'insert_at_cursor')).toBe('agentResident.toolDocumentWrite')
    expect(readableToolName(translate, 'read_production_artifact')).toBe('agentResident.toolProductionRead')
  })

  it('reads the operation out of the arguments, not just the collapsed tool name', () => {
    // The canvas surface advertises `nomi_canvas_maintenance` / `nomi_canvas_edit`; the semantics are
    // in `args.operation`. Keying on the name alone made an irreversible delete render as the generic
    // "inspect details" label, so the approval card said nothing about what was being deleted.
    const del = { operation: 'delete_canvas_nodes', nodeIds: ['node-a', 'node-b'] }
    expect(readableToolName(translate, 'nomi_canvas_maintenance', del)).toBe('agentResident.toolCanvasDelete')
    expect(readableToolSummary(translate, 'nomi_canvas_maintenance', del)).toBe('agentResident.toolCanvasDeleteSummary')
    expect(readableToolPreview(translate, 'nomi_canvas_maintenance', del)).toBe('agentResident.toolTargetCount(count=2)')

    const create = { operation: 'create_canvas_nodes', nodes: [{ title: '镜头 1' }] }
    expect(readableToolName(translate, 'nomi_canvas_edit', create)).toBe('agentResident.toolCanvasCreate')
    expect(readableToolPreview(translate, 'nomi_canvas_edit', create)).toContain('agentResident.toolShotCount(count=1)')

    // The pi-side aliases still carry the operation in the name; both halves keep working.
    expect(readableToolName(translate, 'delete_canvas_nodes')).toBe('agentResident.toolCanvasDelete')
  })

  // 同一个工具，交付的东西不同 → 回执必须说不同的话。看工具名不看 payload，Agent 交一张
  // SVG 构图线稿也会被报成「创建或修改镜头卡 · 把镜头卡写入当前画布 · 只建卡不生成」——
  // 三句没一句是真的（它不是镜头卡，也从来不排队生成）。
  it('全是手艺产物的批次，回执按产物语义说，不套镜头卡措辞', () => {
    const deliver = {
      operation: 'create_canvas_nodes',
      nodes: [
        { title: '开场构图线稿', kind: 'agent-artifact', artifact: { fileType: 'svg', content: '<svg/>' } },
        { title: '开场节奏讲解', kind: 'agent-artifact', artifact: { fileType: 'html', content: '<html/>' } },
      ],
    }
    expect(readableToolName(translate, 'nomi_canvas_edit', deliver)).toBe('agentResident.toolCanvasWriteArtifact')
    expect(readableToolPreview(translate, 'nomi_canvas_edit', deliver)).toBe('agentResident.toolArtifactCount(count=2)')
    const summary = readableToolSummary(translate, 'nomi_canvas_edit', deliver)
    expect(summary).toContain('agentResident.toolCanvasWriteArtifactSummary')
    expect(summary).not.toContain('agentResident.toolCanvasWriteSummary')
    // 「不提交生成、不产生费用」对不调模型的手艺产物是废话，不该出现。
    expect(summary).not.toContain('agentResident.toolNoGeneration')
  })

  it('混着镜头卡的批次仍按镜头卡说（那批里确实有镜头卡）', () => {
    const mixed = {
      operation: 'create_canvas_nodes',
      nodes: [{ title: '镜头 1', kind: 'shot' }, { title: '线稿', kind: 'agent-artifact' }],
    }
    expect(readableToolName(translate, 'nomi_canvas_edit', mixed)).toBe('agentResident.toolCanvasCreate')
    expect(readableToolPreview(translate, 'nomi_canvas_edit', mixed)).toContain('agentResident.toolShotCount(count=2)')
  })

  it('partitions proposal content into a compact bar and on-demand evidence', () => {
    const proposal = proposalForTool(translate, 'nomi_start_generation', {
      prompt: 'a small cat avatar',
      modelId: 'provider/image-fast',
      parameters: { aspectRatio: '1:1', quality: 'standard' },
    })
    expect(proposal).toBeDefined()
    const groups = partitionResidentProposalFields(proposal?.fields ?? [])
    expect(groups.compact.map((field) => field.kind)).toEqual(['model', 'parameters', 'target'])
    expect(groups.prompt.map((field) => field.kind)).toEqual(['prompt'])
    expect(groups.estimate?.kind).toBe('estimate')
    // The disclosure retains the original order and every field, including
    // prompt/estimate/boundary, so editing and audit evidence remain reachable.
    expect(groups.details).toEqual(proposal?.fields)
  })

  it('surfaces patch prompt, model and parameters in the disclosed proposal fields', () => {
    const proposal = proposalForTool(translate, 'nomi_operation_create', {
      patch: {
        prompt: 'replace the third shot with a close-up',
        modelId: 'provider/video-cheap',
        parameters: { duration: 6, aspectRatio: '16:9' },
      },
    })
    expect(proposal?.fields).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: 'agentResident.proposalPrompt', value: 'replace the third shot with a close-up', kind: 'prompt' }),
      expect.objectContaining({ label: 'agentResident.proposalModel', value: 'agentResident.toolVideoModel', kind: 'model' }),
      expect.objectContaining({ label: 'agentResident.proposalParameters', value: expect.stringContaining('agentResident.toolParameterDuration: 6'), kind: 'parameters' }),
    ]))
    const detailRows = readableToolDetailRows(translate, 'nomi_operation_create', {
      patch: { prompt: 'replace the third shot', modelId: 'provider/video-cheap', parameters: { duration: 6 } },
    })
    // ResidentApprovalDetail 每行都带 kind 判别符（同上 proposal.fields 断言、partitionResidentProposalFields
    // 都依赖它）——故用 objectContaining 匹配语义字段，不锁死其余行（target/estimate 等）与 kind 之外的形状。
    expect(detailRows).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: 'agentResident.toolPromptLabel', value: 'replace the third shot', kind: 'prompt' }),
      expect.objectContaining({ label: 'agentResident.toolModelLabel', value: 'provider/video-cheap', kind: 'model' }),
      expect.objectContaining({ label: 'agentResident.toolParametersLabel', value: 'agentResident.toolParameterDuration: 6', kind: 'parameters' }),
    ]))
  })

  it('keeps secret arguments out of visible summaries and technical details', () => {
    const args = { prompt: 'cat avatar', modelId: 'provider/image-fast', apiKey: 'sk-secret-value' }
    expect(readableToolSummary(translate, 'nomi_start_generation', args)).toContain('cat avatar')
    expect(readableToolSummary(translate, 'nomi_start_generation', args)).not.toContain('sk-secret-value')
    expect(redactToolArguments(args)).not.toContain('sk-secret-value')
  })

})

describe('失败正文 → 人话：只有这一条门', () => {
  // 校验失败在这套系统里有两种写法，消费它的地方有三处（收据行内、收据展开体、失败条）。
  // 两种写法各翻各的，就会像 2026-09-06 那样：同一次失败在一处是「nodes：期望 array」、
  // 在另一处是一整段英文。
  const PI_PROSE = [
    'Validation failed for tool "nomi_canvas_edit":',
    '  - nodes: Expected array',
    '',
    'Received arguments:',
    '{',
    '  "nodes": "[{\\"clientId\\":\\"s1\\""',
    '}',
  ].join('\n')

  it('zod issue JSON：哪个字段、要什么、给了什么', () => {
    const issues = JSON.stringify([{ code: 'invalid_type', expected: 'array', received: 'string', path: ['nodes'] }])
    expect(humanizeToolFailure(translate, issues)).toBe('agentResident.issueType(field=nodes,expected=array,received=string)')
  })

  it('pi 的英文散文体回执：抬头丢掉、入参回显丢掉，只留说得出事的那句', () => {
    const humanized = humanizeToolFailure(translate, PI_PROSE)
    expect(humanized).toBe('agentResident.issueExpected(field=nodes,expected=array)')
    expect(humanized).not.toContain('Received arguments')
  })

  it('缺必填字段有自己的说法', () => {
    const text = 'Validation failed for tool "nomi_canvas_edit":\n  - nodes: Expected required property'
    expect(humanizeToolFailure(translate, text)).toBe('agentResident.issueRequired(field=nodes)')
  })

  it('认出了这条回执就再也不放英文出去：一句都翻不动时给通用的那句', () => {
    const text = 'Validation failed for tool "nomi_canvas_edit":\n  - Unknown validation error'
    expect(humanizeToolFailure(translate, text)).toBe('agentResident.issueInvalidArgs')
  })

  it('不是校验回执就不硬翻——供应商已经写好的中文原样交回调用方', () => {
    expect(humanizeToolFailure(translate, '余额不足，请先充值。')).toBeUndefined()
    expect(humanizeToolFailure(translate, '')).toBeUndefined()
  })


})
