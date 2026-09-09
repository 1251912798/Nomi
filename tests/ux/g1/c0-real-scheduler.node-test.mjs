import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolvePlanner } from './c0-real-scheduler.mjs'
test('planner mode matrix keeps legacy modes and requires explicit official real planner', () => {
  for (const options of [{ planOnly: true }, { mixed: true }, {}]) assert.equal(resolvePlanner(options).vendor, 'apimart')
  for (const options of [{ planOnly: true }, { mixed: true }]) assert.equal(resolvePlanner({ ...options, plannerModel: 'deepseek-v4-pro' }).model, 'deepseek-v4-pro')
  assert.equal(resolvePlanner({ plannerVendor: 'apimart', plannerModel: 'gpt-5-nano' }).model, 'gpt-5-nano')
  assert.equal(resolvePlanner({ plannerVendor: 'deepseek-official', plannerModel: 'deepseek-v4-pro' }).vendor, 'deepseek-official')
  assert.throws(() => resolvePlanner({ plannerModel: 'deepseek-v4-pro' }), /VENDOR_REQUIRED/)
  assert.throws(() => resolvePlanner({ plannerVendor: 'other', plannerModel: 'deepseek-v4-pro' }), /VENDOR_REFUSED/)
  assert.throws(() => resolvePlanner({ plannerVendor: 'deepseek-official', plannerModel: 'unknown' }), /PRICE_UNKNOWN/)
})
