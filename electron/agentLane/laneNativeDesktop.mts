// Production resource assembly. The installed libraries own shell execution and OS isolation.
import { SandboxManager } from '@anthropic-ai/sandbox-runtime';
import { createLocalBashOperations } from '@earendil-works/pi-coding-agent';
import type { AgentModelEntry } from '../shared/agentCapabilities/availableModels.js';
import type { SkillRecord } from '../skills/skillStore.js';
import { LANE_WRITE_TOOL_TIMEOUT_MS } from '../shared/agentLane/laneToolContract.js';
import { openLaneSandbox, sandboxPolicyFor, type LaneBashOperations } from './laneCodingSandbox.mjs';
import { createLaneInstalledSkills } from './laneInstalledSkills.mjs';
import { createLaneNativeAssembly, type LaneDeferredGroup } from './laneNativeAssembly.mjs';

export async function openLaneNativeDesktop(input: {
  projectDir: string;
  settingsRoot: string;
  skills: readonly SkillRecord[];
  deferredGroups?: readonly LaneDeferredGroup[];
  availableModels?: () => readonly AgentModelEntry[];
}) {
  const installed = await createLaneInstalledSkills(input.skills);
  const local = createLocalBashOperations();
  // Nomi's operation boundary uses milliseconds; the upstream local backend accepts seconds.
  const localOperations: LaneBashOperations = {
    exec: (command, cwd, options) => local.exec(command, cwd, {
      ...options,
      ...(options.timeout === undefined ? {} : { timeout: options.timeout / 1_000 }),
    }),
  };
  const sandbox = await openLaneSandbox(sandboxPolicyFor(input), { manager: SandboxManager, localOperations });
  try {
    const assembly = await createLaneNativeAssembly({
      projectDir: input.projectDir,
      trustedSkillRoots: installed.trustedSkillRoots,
      sandbox,
      bashTimeoutMs: LANE_WRITE_TOOL_TIMEOUT_MS,
      deferredGroups: input.deferredGroups,
      availableModels: input.availableModels,
    });
    return { ...assembly, skills: installed.skills, sandboxActive: sandbox.active,
      ...(sandbox.inactiveReason ? { sandboxInactiveReason: sandbox.inactiveReason } : {}),
      close: () => sandbox.close() };
  } catch (cause) {
    await sandbox.close();
    throw cause;
  }
}
