import { z } from 'zod';
import type { ProjectBinding } from '../projectBinding';
import type { DesktopLocale } from '../../desktopLocale';

export interface LegacyImportLabels { summaryPrefix: string; unverifiedToolResult: string }
export interface LegacyMigrationOptions {
  projectDir: string; userDataDir: string; binding: ProjectBinding;
  locale: DesktopLocale; labels: (locale: DesktopLocale) => LegacyImportLabels;
  /** Fault injection/observation; never carries user content. */
  checkpoint?: (stage: string) => Promise<void>;
}
export const legacyMigrationCountsSchema = z.object({ projects: z.number().int().nonnegative(),
  sourceFiles: z.number().int().nonnegative(), conversations: z.number().int().nonnegative(),
  sourceItems: z.number().int().nonnegative(), parts: z.number().int().nonnegative(),
  archivedOnlyConversations: z.number().int().nonnegative() }).strict();
export type LegacyMigrationCounts = z.infer<typeof legacyMigrationCountsSchema>;
export type MigrateLaneLegacy = (options: LegacyMigrationOptions) => Promise<LegacyMigrationCounts>;
