import { Type } from 'typebox';
import type { AgentModelEntry } from '../shared/agentCapabilities/availableModels.js';

/** Same target and identity fields as the existing MCP nomi_read(models) surface. */
export const laneModelReadDefinition = {
  name: 'nomi_read', label: 'Models',
  description: 'Read the current complete model catalog, including modes, parameters and reference slots. target must be models. Optional modelKey narrows the catalog to one model before choosing its parameters or references.',
  promptSnippet: 'Read complete current model capabilities; optionally narrow by modelKey',
  parameters: Type.Object({ target: Type.String({ enum: ['models'] }), modelKey: Type.Optional(Type.String()) }, { additionalProperties: false }),
  replay: 'safe' as const,
};

export function createLaneModelRead(resolve: () => readonly AgentModelEntry[]) {
  return { ...laneModelReadDefinition, execute: async (_id: string, args: { target: string; modelKey?: string }) => {
    if (args.target !== 'models') throw new Error('Use target=models.');
    const entries = resolve().filter(entry => args.modelKey === undefined || entry.modelKey === args.modelKey);
    return { content: [{ type: 'text' as const, text: JSON.stringify({ models: entries }) }],
      details: { models: entries } };
  } };
}
