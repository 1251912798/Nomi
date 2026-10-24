import { z } from "zod";

import type { CapabilityContract } from "./capabilityContract";

export const agentContextReadInputSchema = z.object({
  cursor: z.string().optional().describe("c"),
  kind: z.string().optional().describe("k"),
}).strict();

export const agentContextReadResultSchema = z.object({
  total: z.number().int().nonnegative(),
  handles: z.array(z.record(z.unknown())),
  nextCursor: z.string().optional(),
}).strict();

export type AgentContextReadInput = z.infer<typeof agentContextReadInputSchema>;
export type AgentContextReadResult = z.infer<typeof agentContextReadResultSchema>;

/** Desktop-only: this capability reads the immutable snapshot attached to one resident Agent message. */
export const AGENT_CONTEXT_READ_CAPABILITY = {
  id: "agent.context.read",
  version: 1,
  aliases: { pi: "read_selection" },
  inputSchema: agentContextReadInputSchema,
  outputSchema: agentContextReadResultSchema,
  effect: "read",
  effectClass: "reversible_local",
  execution: { port: "agent-context", availability: "main_only" },
  exposure: "internal_only",
  requiredScope: "agent:context",
  targetKind: "project",
} as const satisfies CapabilityContract<AgentContextReadInput, AgentContextReadResult>;
