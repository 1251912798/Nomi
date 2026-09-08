// Skill discovery remains skillStore's job. This adapter consumes its trusted records only.
import { lstat, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import type { SkillRecord } from '../skills/skillStore.js';
import { parseSkillFrontmatter } from '../skills/skillFrontmatter.js';
import type { LaneSkillIndexEntry } from '../shared/agentLane/laneContracts.js';
import { laneSkillRequiresCodingTools } from './laneSkillIndex.mjs';

export async function createLaneInstalledSkills(records: readonly SkillRecord[]): Promise<{
  skills: readonly LaneSkillIndexEntry[];
  trustedSkillRoots: readonly string[];
}> {
  const skills: LaneSkillIndexEntry[] = [];
  const trustedSkillRoots = new Set<string>();
  for (const record of records) {
    if (!path.isAbsolute(record.filePath) || path.basename(record.filePath) !== 'SKILL.md') {
      throw new Error('Installed Skill records require an absolute SKILL.md path.');
    }
    const root = path.dirname(path.resolve(record.filePath));
    const [rootStat, fileStat] = await Promise.all([lstat(root), lstat(record.filePath)]);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink() || !fileStat.isFile() || fileStat.isSymbolicLink()) {
      throw new Error('Installed Skill package roots and SKILL.md must not be symbolic links.');
    }
    const canonicalRoot = await realpath(root);
    const canonicalFile = await realpath(record.filePath);
    if (path.dirname(canonicalFile) !== canonicalRoot) throw new Error('Installed Skill path escaped its package.');
    const children = await readdir(canonicalRoot, { withFileTypes: true });
    skills.push({
      name: record.name,
      description: record.description,
      filePath: canonicalFile,
      disableModelInvocation: record.disableModelInvocation === true,
      requiresCodingTools: laneSkillRequiresCodingTools({
        childDirectoryNames: children.filter((entry) => entry.isDirectory() && !entry.isSymbolicLink()).map((entry) => entry.name),
        frontmatterValues: parseSkillFrontmatter(record.body).values,
      }),
    });
    trustedSkillRoots.add(root);
  }
  return { skills, trustedSkillRoots: [...trustedSkillRoots] };
}
