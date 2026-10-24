import { describe, expect, it } from 'vitest'
import { NODE_KIND_CONNECTS, referenceAssetKindForNode, validateReferenceEdge, type EdgeAdmissionMode } from '../canvas/edgeAdmission'
import { plannedEdgeSchema } from './canvasWrite'

// D4：canvas.write 的 mode 说明写「text 不能当 reference 源」，而准入（edgeAdmission）允许文字当上下文喂给
// 图 / 视频 / 3D / 文本节点——说明和闸门说了两套话，外部 Agent 照说明会放弃一条本来合法的文字上下文边。
// 对账：说明里点名的种类 == 准入实际放行的种类，逐个种类用闸门本身核。
const description = (): string => {
  const text = plannedEdgeSchema.shape.mode.description
  if (!text) throw new Error('edge mode must carry a description')
  return text
}
const KINDS = Object.keys(NODE_KIND_CONNECTS)
const MODES: EdgeAdmissionMode[] = ['reference', 'first_frame', 'last_frame', 'style_ref', 'character_ref', 'composition_ref']

describe('canvas.write 连线说明 与 edgeAdmission 对账', () => {
  const admittedTextTargets = KINDS.filter((kind) => validateReferenceEdge({ kind: 'text' }, { kind }, 'reference').ok)

  it('文字节点：准入放行的目标集合 == 说明里「prompt context to: …」点名的集合（一个不多一个不少）', () => {
    expect(admittedTextTargets.length).toBeGreaterThan(0)
    const named = /prompt context to: ([^.]+)\./.exec(description())
    expect(named, '说明必须点名文字上下文能喂给哪些节点').not.toBeNull()
    const listed = named![1].split(',').map((item) => item.trim()).filter(Boolean).sort()
    expect(listed).toEqual([...admittedTextTargets].sort())
  })

  it('文字不当「媒体参考」：只有通用 reference 模式放行，其余模式（首帧 / 尾帧 / 风格 / 角色 / 构图）一律拒收', () => {
    for (const kind of KINDS) {
      for (const mode of MODES.filter((m) => m !== 'reference')) {
        expect(validateReferenceEdge({ kind: 'text' }, { kind }, mode).ok, `${mode} → ${kind}`).toBe(false)
      }
    }
    expect(description()).toMatch(/other modes[^.]*skipped|only the generic reference/i)
  })

  it('不再整段声称「text/shot/output 不能当参考源」（对文字是错的）', () => {
    expect(description()).not.toMatch(/text\/shot\/output nodes cannot be a reference source/)
  })

  it('说明点名「没有产出、不能当源」的种类，必须真的是闸门判没有可参考资产的', () => {
    const named = /produce nothing to reference: ([^.]+)\./.exec(description())
    expect(named, '说明必须点名没有产出的节点种类').not.toBeNull()
    const listed = named![1].split(',').map((item) => item.trim()).filter(Boolean)
    for (const kind of listed) expect(referenceAssetKindForNode({ kind }), kind).toBeNull()
    // 反向：凡是「没有产出」的种类都要点名；文字另有一句，不在此列。
    const expected = KINDS.filter((kind) => kind !== 'text' && !NODE_KIND_CONNECTS[kind as keyof typeof NODE_KIND_CONNECTS].output)
    expect([...listed].sort()).toEqual([...expected].sort())
  })
})
