import assert from 'node:assert/strict'
import { test } from 'node:test'
import { LANE_DEFERRED_TOOL_CATALOG } from '../../electron/agentLane/laneToolCatalog.js'
import { createLaneTools } from '../../electron/agentLane/laneTools.mjs'
import { bindLaneTool } from '../../electron/agentLane/laneRuntimePort.js'
import { capabilityContractById } from '../../electron/shared/agentCapabilities/registry.js'
import { modelToolCapabilityId } from '../../electron/shared/agentCapabilities/modelFacingTools.js'

for (const spec of LANE_DEFERRED_TOOL_CATALOG) {
  test(`${spec.name}: deferred effects preserve its canonical approval and replay boundary`, () => {
    const contract = capabilityContractById(spec.contractId)!
    const mutates = contract.effect !== 'read'
    const billable = contract.effect === 'paid' || contract.effectClass === 'spend'
    assert.deepEqual(spec.effects, { mutates, billable,
      reversal: mutates && contract.effectClass === 'reversible_local' ? 'undoable' : 'none' })
    for (const operation of Object.keys(spec.operationCapabilityIds ?? {})) {
      const actual = capabilityContractById(modelToolCapabilityId(spec, { operation }))!
      assert.ok(actual)
      assert.ok(actual.effect === 'read' || spec.effects.mutates, `${operation}: cannot advertise replay-safe writes`)
      assert.ok(actual.effect !== 'paid' || spec.effects.billable, `${operation}: cannot hide spending`)
      assert.ok(actual.effectClass !== 'irreversible' || spec.effects.reversal === 'none')
    }
  })
}

test('irreversible tools with no guaranteed undo assemble as non-replayable writes', () => {
  const spec = LANE_DEFERRED_TOOL_CATALOG.find(spec => spec.name === 'delete_canvas_nodes')!
  const [tool] = createLaneTools([bindLaneTool({ ...spec,
    effects: { mutates: true, billable: false, reversal: 'none' },
  }, async () => ({ ok: true, text: 'fixture' }))])
  assert.equal(tool!.replay, 'never')
  assert.throws(() => createLaneTools([bindLaneTool({ ...spec,
    effects: { mutates: false, billable: false, reversal: 'undoable' },
  }, async () => ({ ok: true, text: 'fixture' }))]), /nothing to reverse/)
})
