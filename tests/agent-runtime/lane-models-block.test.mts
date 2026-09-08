import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { rmSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { buildSync } = createRequire(require.resolve('vite/package.json'))('esbuild');
const desktopBundle = path.resolve(`.tmp/lane-models-input-${process.pid}.cjs`);
buildSync({ entryPoints: [path.resolve('electron/agentLane/laneDesktopInput.ts')], outfile: desktopBundle,
  bundle: true, platform: 'node', format: 'cjs', packages: 'external', logLevel: 'silent' });
after(() => rmSync(desktopBundle, { force: true }));
const { createDesktopLaneInput, parseLaneComposerContext } = require(desktopBundle);
import { deriveModelListing } from '../../electron/catalog/modelCatalogListing.js';
import type { CatalogState } from '../../electron/catalog/types.js';
import type { LaneComposerContext } from '../../electron/shared/agentLane/laneDesktopContracts.js';
import { createLaneFixture } from './laneFixture.mjs';

async function catalogProjection() {
  const fixtureModule = await import(path.resolve('tests/ux/agent-runtime-fixture.mjs'));
  const state = { version: 8, vendors: [{ key: 'apimart', name: 'APIMart', enabled: true, authType: 'none' }],
    models: [{ vendorKey: 'apimart', modelKey: 'MiniMax-H3', labelZh: 'MiniMax H3', kind: 'video', enabled: true, published: true }],
    mappings: [{ vendorKey: 'apimart', modelKey: 'MiniMax-H3', enabled: true, taskKind: 'text_to_video', create: { body: {} } }], apiKeysByVendor: {} } as unknown as CatalogState;
  const listing = deriveModelListing(state);
  assert.equal(listing[0]?.keyStatus, 'ok');
  const models = state.models.filter((model) => listing.some((row) => row.keyStatus === 'ok' && row.modelKey === model.modelKey));
  return { listing, entries: await fixtureModule.projectAgentRuntimeModels(process.cwd(), models) };
}

const policy = { mode: 'safe-auto', spend: 'confirm' } as const;

test('C0 real desktop callsite sends catalog-projected available models in the user prompt on every turn', async (t) => {
  const { entries, listing } = await catalogProjection();
  assert.ok(entries.length > 0, 'Real archetype projection must retain the configured model');
  const fixture = await createLaneFixture(t, [{ type: 'text', text: 'First.' }, { type: 'text', text: 'Second.' }]);
  const previous = { settings: process.env.NOMI_SETTINGS_DIR, projects: process.env.NOMI_PROJECTS_DIR };
  process.env.NOMI_SETTINGS_DIR = path.join(fixture.projectDir, 'settings');
  process.env.NOMI_PROJECTS_DIR = path.join(fixture.projectDir, 'projects');
  t.after(() => {
    if (previous.settings === undefined) delete process.env.NOMI_SETTINGS_DIR; else process.env.NOMI_SETTINGS_DIR = previous.settings;
    if (previous.projects === undefined) delete process.env.NOMI_PROJECTS_DIR; else process.env.NOMI_PROJECTS_DIR = previous.projects;
  });
  let context: LaneComposerContext = { approvalPolicy: policy, ...{ availableModels: entries } };
  const input = createDesktopLaneInput({ projectId: 'models-fixture', capture: () => context, activate: () => {},
    model: () => ({ model: { modelKey: 'chosen-model' } as CatalogState['models'][number], kind: 'openai-compatible' }) });
  const lane = await fixture.openLane({ ...fixture.options, input });
  await lane.execute({ kind: 'prompt', text: '八镜用 MiniMax H3，768P。' });
  const users = (body: unknown) => (body as { messages: Array<{ role: string; content: unknown }> }).messages.filter((m) => m.role === 'user');
  const prompt = JSON.stringify(users(fixture.http.requests[0].body).at(-1)?.content);
  assert.match(prompt, /可用模型/);
  assert.ok(prompt.includes(`modelKey=${listing[0].modelKey}`));
  assert.match(prompt, /resolution\[.*768P/);
  context = { approvalPolicy: policy, ...{ availableModels: [] } };
  await lane.execute({ kind: 'prompt', text: '现在断开了模型。' });
  assert.doesNotMatch(JSON.stringify(users(fixture.http.requests[1].body).at(-1)?.content), /可用模型/);
});

test('composer boundary accepts the real projection and rejects malformed model entries', async () => {
  const { entries } = await catalogProjection();
  const context = { approvalPolicy: policy, availableModels: entries };
  assert.deepEqual(parseLaneComposerContext(context), context);
  assert.throws(() => parseLaneComposerContext({ ...context, availableModels: [{ modelKey: 'incomplete' }] }));
  assert.deepEqual(parseLaneComposerContext({ approvalPolicy: policy }), { approvalPolicy: policy });
});
