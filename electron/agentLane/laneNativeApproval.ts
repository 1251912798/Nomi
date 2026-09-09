import { classifyCommand } from '../shared/agentCapabilities/codingCommandPolicy';
import type { LaneApprovalSubjectResolver } from '../shared/agentLane/laneApproval';
import type { LaneToolEffects } from '../shared/agentLane/laneToolContract';

/** Main-process effects are trusted. Model arguments cannot add a tool or relax a shell verdict. */
export function createLaneNativeApprovalResolver(input: {
  projectDir: string;
  sandboxActive: boolean;
  effects: Readonly<Record<string, LaneToolEffects>>;
}): LaneApprovalSubjectResolver {
  return (request) => {
    const effects = Object.hasOwn(input.effects, request.toolName) ? input.effects[request.toolName] : undefined;
    if (!effects) return undefined;
    const subject = {
      toolName: request.toolName,
      capabilityId: `native:${request.toolName}`,
      effect: effects.billable ? 'paid' as const : effects.mutates ? 'reversible_write' as const : 'read' as const,
      effectClass: effects.billable ? 'spend' as const : effects.reversal === 'none' && effects.mutates
        ? 'irreversible' as const : 'reversible_local' as const,
      requiresPlanReview: false,
      destructiveHint: false,
    };
    if (request.toolName !== 'bash') return { subject };
    const args = request.args && typeof request.args === 'object' ? request.args as Record<string, unknown> : {};
    const verdict = classifyCommand({
      command: typeof args.command === 'string' ? args.command : '',
      projectDir: input.projectDir, sandboxActive: input.sandboxActive,
    });
    if (verdict.decision === 'deny') return { subject, denialReason: verdict.modelReason, grantable: false };
    if (verdict.decision === 'auto-allow') return { subject };
    // An escaped command may reuse only its own classifier-derived pattern, never a blanket bash grant.
    const pattern = verdict.tier === 'escape' && input.sandboxActive ? verdict.rememberablePattern : null;
    return {
      subject: {
        ...subject,
        ...(verdict.tier === 'hard-list' ? { effect: 'destructive' as const, effectClass: 'irreversible' as const } : {}),
        capabilityId: pattern ? `native:bash:${pattern}` : subject.capabilityId,
      },
      forceConfirmation: true,
      grantable: Boolean(pattern),
    };
  };
}
