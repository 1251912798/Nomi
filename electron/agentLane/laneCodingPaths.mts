// Nomi supplies trusted package roots; model paths never add authority.
import path from 'node:path';
import { lstat, realpath } from 'node:fs/promises';

export class LaneCodingPathError extends Error {
  constructor(attempted: string, projectDir: string) {
    super(`${attempted} is outside this project or its permitted read-only Skill packages. `
      + `Writes must remain under ${projectDir}. Use a path relative to the project root, `
      + 'or read a Skill at the exact installed location listed in available_skills.');
    this.name = 'LaneCodingPathError';
  }
}

function within(target: string, root: string): boolean {
  const relative = path.relative(root, target);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

export function containPath(absolutePath: string, projectDir: string): string {
  const target = path.resolve(absolutePath);
  if (!within(target, path.resolve(projectDir))) throw new LaneCodingPathError(absolutePath, projectDir);
  return target;
}

/** Resolve missing write targets through the nearest existing parent, including mkdir's nested parents. */
async function canonicalTarget(target: string, missing: boolean): Promise<string> {
  try { return await realpath(target); } catch (cause) {
    if (!missing || (cause as NodeJS.ErrnoException).code !== 'ENOENT') throw cause;
    const entry = await lstat(target).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return undefined;
      throw error;
    });
    // ENOENT is also returned for an existing symlink whose destination is missing. Treating
    // that link as a new ordinary file would let writeFile follow it outside the pinned root.
    if (entry?.isSymbolicLink()) throw new Error('Cannot write through a dangling symbolic link.', { cause });
    const parent = path.dirname(target);
    if (parent === target) throw cause;
    return path.join(await canonicalTarget(parent, true), path.basename(target));
  }
}

export async function createLaneCodingPaths(projectDir: string, trustedSkillRoots: readonly string[] = []) {
  const pin = async (root: string) => {
    if (!path.isAbsolute(root)) throw new Error('Coding roots must be trusted absolute paths.');
    return { lexical: path.resolve(root), canonical: await realpath(root) };
  };
  const project = await pin(projectDir);
  const skills = await Promise.all([...new Set(trustedSkillRoots)].map(pin));
  const check = async (targetPath: string, writing: boolean, missing = false, skillsOnly = false): Promise<string> => {
    const target = path.resolve(targetPath);
    const allowed = writing ? [project] : skillsOnly ? skills : [project, ...skills];
    // Canonical aliases (e.g. /var -> /private/var) remain usable after pi resolves a previous path.
    const roots = allowed.filter((root) => within(target, root.lexical) || within(target, root.canonical));
    if (!roots.length) throw new LaneCodingPathError(targetPath, project.lexical);
    const canonical = await canonicalTarget(target, missing);
    if (writing && skills.some((root) => within(canonical, root.canonical))) {
      throw new LaneCodingPathError(targetPath, project.lexical);
    }
    if (!roots.some((root) => within(canonical, root.canonical))) {
      throw new LaneCodingPathError(targetPath, project.lexical);
    }
    return canonical;
  };
  return {
    read: (target: string) => check(target, false),
    readSkill: (target: string) => check(target, false, false, true),
    write: (target: string) => check(target, true, true),
    readExists: async (target: string) => {
      try { await check(target, false); return true; } catch (cause) {
        if ((cause as NodeJS.ErrnoException).code === 'ENOENT') return false;
        throw cause;
      }
    },
  };
}
