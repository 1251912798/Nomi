// Manual, zero-network protocol exercise; synthetic responses are not a VLM assessment.
import fs from 'node:fs/promises'
import path from 'node:path'
import { readJson, rubricFile } from './collect.mjs'
import { judgeInput, judgeWithAdapter, validateEvidence } from './judge.mjs'

const directory = path.resolve(process.argv[2] || 'artifacts/experience/runs/agent-panel')
const run = await readJson(path.join(directory, 'steps.json'))
await validateEvidence(run, directory)
const input = judgeInput(run, await readJson(rubricFile))
const output = await judgeWithAdapter(input, {
  model: 'synthetic-manual-example-no-model-called',
  evaluate: async (request) => ({
    synthetic: true,
    cost: 0,
    dimensions: request.rubric.dimensions
      .filter((d) => d.judge)
      .map((d) => ({
        id: d.id,
        score: null,
        reason: '仅验证 VLM/Opus 接口。没有调用模型，不能给真实体验评分。',
        evidence: [{ step: request.steps[0].id }],
      })),
  }),
})
await fs.writeFile(path.join(directory, 'manual-judge-example.json'), JSON.stringify({ input, output }, null, 2) + '\n')
console.log(`Synthetic judge example validated for ${run.journey}; model calls=0; cost=0`)
