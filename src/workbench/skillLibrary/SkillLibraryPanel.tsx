/**
 * 技能库。技能在 App 里唯一的「家」：浏览（我的 / 内置各组）、搜索、导入（选文件 / 拖进来）、用 AI 新建、导出、删除、放进对话。
 * 只列 `kind: skill`——提示词、效果都在提示词库（用户 10-23「它们之间有混用」，10-24 拍板 Q1）。
 * 排版按 2026-10-24 拍板图（docs/design/boards/2026-10-24/SkillLibrary、LibraryDrawers、LibraryMine、SkillDetail）：
 *   宽页 = 工具在项目库页签同一行（搜索 · 导入 · 新建），左侧常驻分类列，右侧分组条卡（3 列），首页每组一行 +「全部 N ›」；
 *   抽屉 = 导入 / 新建在抽屉标题行，第一行搜索 +「分类 ▾」，条卡 1 列、每组两条。
 * 设计卡：docs/plan/2026-10-23-skill-prompt-library-layout.md。导入/导出纯走渲染层（FileReader 读包 / Blob 下载），
 * 版本戳与安全校验都在主进程 skillPackage.ts。创建只走 AI（复用创作区「让 AI 帮我写技能」）。
 */
import React, { type JSX } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { IconPackage, IconUpload, IconWand } from '@tabler/icons-react'
import { cn } from '../../utils/cn'
import { DesignEmptyState, DesignSearchInput, WorkbenchIconButton } from '../../design'
import { notify } from '../../ui/notificationPolicy'
import { showUndoToast } from '../../utils/showUndoToast'
import { useWorkbenchStore } from '../workbenchStore'
import type { SkillListItemDto } from '../api/skillApi'
import { useWorkbenchSkills } from './useWorkbenchSkills'
import { parseSkillImportFile, type SkillImportParse } from './parseSkillImport'
import { parseSkillDrop } from './skillDropIntake'
import { markLibraryUsed, sortByLibraryUsage, useLibraryUsageVersion } from '../library/libraryDiscovery'
import { galleryEntries, matchesGalleryQuery, type SkillGalleryEntry } from './skillGallery'
import { SkillDetail } from './SkillDetail'
import { SkillMedia } from './SkillMedia'
import { deleteSkillWithUndo } from './deleteSkillWithUndo'
import {
  LIBRARY_CATEGORY_ALL,
  LIBRARY_SECTION_MINE,
  buildLibrarySections,
  libraryColumns,
  libraryHomeCount,
  libraryNavGroups,
  librarySectionsView,
  type LibraryHost,
} from '../library/libraryLayout'
import { LibraryCategoryMenu, LibraryCategoryNav } from '../library/LibraryCategoryNav'
import { LibraryEntryFace, LibraryStripCard } from '../library/LibraryEntryFace'
import { LibrarySectionList, type LibraryGridSpec } from '../library/LibrarySectionList'
import { useElementWidth } from '../creation/storyboard/shotRow/useElementWidth'

const SKILL_AUTHOR_KEY = 'skill-author'

/** 条卡排法（量自拍板图）：宽页 78 高、列距 / 行距 12、组距 22，最多 3 列；抽屉 66 高、行距 6、组距 16。 */
const SKILL_GRID: Record<LibraryHost, LibraryGridSpec> = {
  page: { minCardWidth: 260, maxColumns: 3, columnGap: 12, rowGap: 12, sectionGap: 22, cardHeight: () => 78 },
  drawer: { minCardWidth: 240, maxColumns: 3, columnGap: 8, rowGap: 6, sectionGap: 16, cardHeight: () => 66 },
}

type SkillLibraryContentProps = {
  /** page = 项目库页签（没开项目）；drawer = 项目里左栏抽屉。 */
  host: LibraryHost
  /** 宿主给的工具位：宽页是项目库页签那一行，抽屉是抽屉标题行。 */
  toolbarHost: HTMLElement | null
  className?: string
}

export function SkillLibraryContent({ host, toolbarHost, className }: SkillLibraryContentProps): JSX.Element {
  const { t, i18n } = useTranslation()
  const page = host === 'page'
  const [category, setCategory] = React.useState<string>(LIBRARY_CATEGORY_ALL)
  const [query, setQuery] = React.useState('')
  const [selected, setSelected] = React.useState<SkillGalleryEntry | null>(null)
  const [feedback, setFeedback] = React.useState<Record<string, string>>({})
  const report = React.useCallback((identity: string, message: string) => notify({ identity: `skill-library:${identity}`, reason: 'operation', level: 'inline', message, present: (value) => setFeedback((old) => ({ ...old, [identity]: value })) }), [])
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const [dragActive, setDragActive] = React.useState(false)
  const scrollElementRef = React.useRef<HTMLDivElement | null>(null)
  const setScrollElement = React.useCallback((element: HTMLDivElement | null) => { scrollElementRef.current = element }, [])
  const usageVersion = useLibraryUsageVersion()

  const { items, remove, importPackage, exportPackage } = useWorkbenchSkills(true)
  const setWorkspaceMode = useWorkbenchStore((s) => s.setWorkspaceMode)
  const setCreationActiveSkill = useWorkbenchStore((s) => s.setCreationActiveSkill)

  // 项目库页上没有打开的项目：「放进对话」「用 AI 新建」挂的芯片没有对话可去，会漏进下一个新建的项目（真机 J-01）。
  // 这两颗在页上禁用并说原因（C1），在项目里的抽屉里照常。
  const needsProjectReason = page ? t('libraries.layout.needsProject') : undefined

  const sections = React.useMemo(() => {
    // The usage hook is the same-window invalidation signal for recency.
    void usageVersion
    return buildLibrarySections(
      galleryEntries(items, i18n.language),
      (entry) => (entry.skill.origin === 'user' ? { segment: 'mine' } : { segment: 'builtin', group: entry.group }),
      { mine: t('libraries.layout.mine'), other: t('libraries.layout.other') },
    ).map((section) => ({ ...section, items: sortByLibraryUsage(section.items, 'skill', (entry) => entry.skill.directoryName) }))
  }, [items, i18n.language, t, usageVersion])
  const navGroups = React.useMemo(() => libraryNavGroups(sections, t('libraries.layout.all')), [sections, t])
  const spec = SKILL_GRID[host]
  const width = useElementWidth(scrollElementRef, 'content') ?? 0
  const columns = libraryColumns(width, { minCardWidth: spec.minCardWidth, gap: spec.columnGap, max: spec.maxColumns })
  const trimmedQuery = query.trim()
  const views = React.useMemo(() => librarySectionsView(sections, {
    category,
    match: trimmedQuery ? (entry) => matchesGalleryQuery(entry, trimmedQuery) : undefined,
    homeCount: libraryHomeCount(columns),
  }), [sections, category, trimmedQuery, columns])

  // 在创作区锁定一个技能并切到创作区（与 ActiveSkillChip 的 onSelect 同口径）；抽屉随工作模式切换自己让开。
  const gotoCreationWith = React.useCallback(
    (skill: { key: string } | null) => {
      setCreationActiveSkill(skill)
      setWorkspaceMode('creation')
    },
    [setCreationActiveSkill, setWorkspaceMode],
  )

  const handleAddToChat = React.useCallback(
    (skill: SkillListItemDto) => {
      gotoCreationWith({ key: skill.name })
      markLibraryUsed('skill', skill.directoryName)
    },
    [gotoCreationWith],
  )

  const handleNewWithAi = React.useCallback(() => gotoCreationWith({ key: SKILL_AUTHOR_KEY }), [gotoCreationWith])

  // 导出：技能包对象 → JSON Blob → 浏览器下载，不弹系统对话框。
  const handleExport = React.useCallback(
    async (skill: SkillListItemDto) => {
      setFeedback({})
      const pkg = await exportPackage(skill.directoryName)
      if (!pkg) {
        report(skill.directoryName, t('libraries.skill.exportNotFound'))
        return
      }
      const blob = new Blob([JSON.stringify(pkg, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${skill.directoryName}.nomiskill.json`
      a.click()
      URL.revokeObjectURL(url)
    },
    [exportPackage, report, t],
  )

  // 删除可撤销：删前先把包抓在手里，撤销 = 重新导入（落回用户目录，目录名冲突会自动避让）。
  const handleDelete = React.useCallback(
    async (skill: SkillListItemDto) => {
      setFeedback({})
      await deleteSkillWithUndo({
        directoryName: skill.directoryName,
        label: skill.label,
        exportPackage,
        remove,
        importPackage,
        report,
        showUndoToast,
        backupFailedMessage: t('libraries.skill.deleteBackupFailed'),
        deleteFailedMessage: t('libraries.skill.deleteFailed'),
        deletedMessage: t('libraries.skill.deleted', { name: skill.label }),
      })
    },
    [exportPackage, remove, importPackage, report, t],
  )

  // 导入：渲染层把 SKILL.md / zip / .nomiskill.json 归一成 {dirName, files} → 落用户目录
  // （版本戳与真正的安全校验都在主进程 skillPackage.ts，渲染层的判断一律不可信）。
  // 选文件与拖进来共用这一个落地：两条路只是「怎么把包递过来」不同，落地与回执必须是同一份。
  const landImport = React.useCallback(
    (parsed: SkillImportParse) => {
      if (!parsed.ok) {
        report(`import:${parsed.reason}`, t(`libraries.skill.importReason.${parsed.reason}`))
        return
      }
      const res = importPackage(parsed.payload)
      if (!res.ok) {
        report(`import:${parsed.payload.dirName}`, t('libraries.skill.importFailed', { message: res.error ?? t('libraries.skill.unknownError') }))
        return
      }
      const name = res.skillName ?? t('libraries.skill.newSkill')
      // 导进来的在「我的」里：直接切过去，让用户一眼看到它。跳过的文件如实报数，不静默丢。
      setCategory(LIBRARY_SECTION_MINE)
      setQuery('')
      if (parsed.skipped.length) report(`import:${name}`, t('libraries.skill.importedWithSkips', { name, count: parsed.skipped.length }))
    },
    [importPackage, report, t],
  )

  const handleImportFile = React.useCallback(
    async (file: File) => {
      setFeedback({})
      try { landImport(await parseSkillImportFile(file)) } catch (error) { report(file.name, error instanceof Error ? error.message : String(error)) }
    },
    [landImport, report],
  )

  // 拖拽是加速器不是新入口（设计系统 §1.5.2）：只让面板认得「松手」。它同时补上了系统对话框选不中的**技能文件夹**。
  const dragCarriesFiles = (event: React.DragEvent): boolean =>
    Array.from(event.dataTransfer?.types ?? []).includes('Files')

  const handleDragOver = React.useCallback((event: React.DragEvent) => {
    if (!dragCarriesFiles(event)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
    setDragActive(true)
  }, [])

  const handleDragLeave = React.useCallback((event: React.DragEvent) => {
    // 只有真的离开了整块面板才熄灭：子元素之间移动也会冒 dragleave，不判会闪。
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
    setDragActive(false)
  }, [])

  const handleDrop = React.useCallback(
    async (event: React.DragEvent) => {
      if (!dragCarriesFiles(event)) return
      event.preventDefault()
      setDragActive(false)
      // 一次拖多个各自成败：一个坏包不该把同批的好包一起否掉。
      setFeedback({})
      try {
        for (const parsed of await parseSkillDrop(event.dataTransfer)) landImport(parsed)
      } catch (error) { report('drop', error instanceof Error ? error.message : String(error)) }
    },
    [landImport, report],
  )

  const search = (
    <DesignSearchInput
      value={query}
      onChange={setQuery}
      placeholder={t('libraries.skill.searchPlaceholder')}
      ariaLabel={t('libraries.skill.searchAria')}
      className={page ? 'ml-3 w-[260px] max-w-full flex-none' : 'min-w-0 flex-1'}
    />
  )
  const importButton = (
    <WorkbenchIconButton size="sm" icon={<IconUpload />} label={t('libraries.skill.importAria')} onClick={() => fileInputRef.current?.click()} data-skill-import />
  )
  const tools = page ? (
    <>
      {search}
      <span className="flex-1" />
      {importButton}
      <button
        type="button"
        onClick={handleNewWithAi}
        disabled={Boolean(needsProjectReason)}
        title={needsProjectReason ?? t('libraries.skill.createAria')}
        data-skill-new
        className={cn(
          'inline-flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-pill border-0 bg-nomi-paper px-3 text-caption font-medium text-nomi-ink-80 ring-1 ring-nomi-line',
          'transition-colors hover:bg-nomi-ink-05 focus-visible:outline focus-visible:outline-2 focus-visible:outline-nomi-ink',
          'disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-nomi-paper',
        )}
      >
        <IconWand size={14} stroke={1.7} className="text-nomi-ink-60" aria-hidden="true" />
        {t('libraries.skill.create')}
      </button>
    </>
  ) : (
    <>
      {importButton}
      <WorkbenchIconButton size="sm" icon={<IconWand />} label={t('libraries.skill.createAria')} onClick={handleNewWithAi} data-skill-new />
    </>
  )

  const receipts = Object.entries(feedback).filter(([, message]) => message)
  const mineEmpty = category === LIBRARY_SECTION_MINE && !trimmedQuery && !sections.find((section) => section.id === LIBRARY_SECTION_MINE)?.items.length
  const nothing = !views.some((view) => view.items.length > 0)
  const emptyState = mineEmpty ? (
    <div className="flex min-h-full items-center justify-center" data-library-mine-empty>
      <DesignEmptyState
        icon={<span className="grid size-11 place-items-center rounded-panel bg-nomi-ink-05 text-nomi-ink-40"><IconPackage size={20} stroke={1.5} /></span>}
        title={t('libraries.skill.noMine')}
        description={t('libraries.skill.mineEmptyHint')}
        className="[&>div:last-child]:max-w-[440px]"
      />
    </div>
  ) : nothing ? (
    <DesignEmptyState
      title={trimmedQuery ? t('libraries.skill.noMatch') : t('libraries.skill.noBuiltin')}
      description={trimmedQuery ? t('libraries.skill.tryAnotherSearch') : undefined}
      density="inline"
    />
  ) : null

  const renderCard = React.useCallback((entry: SkillGalleryEntry) => (
    <LibraryStripCard size={host} onOpen={() => setSelected(entry)} data-skill-card={entry.id} title={entry.title}>
      <LibraryEntryFace
        size={host}
        title={entry.title}
        description={entry.description}
        media={(coverClassName) => (
          <SkillMedia cover={entry.cover} preview={entry.preview} preferCover illustration={entry.illustration} iconSize={host === 'page' ? 20 : 16} className={coverClassName} />
        )}
      />
    </LibraryStripCard>
  ), [host])
  const keyOf = React.useCallback((entry: SkillGalleryEntry) => entry.id, [])

  const list = (
    <LibrarySectionList
      views={nothing ? [] : views}
      width={width}
      columns={columns}
      spec={spec}
      size={host}
      keyOf={keyOf}
      renderItem={renderCard}
      onShowAll={setCategory}
      showCounts={category !== LIBRARY_CATEGORY_ALL || Boolean(trimmedQuery)}
      scrollRef={setScrollElement}
      className={page ? 'pb-8 pr-1' : 'px-3 pb-3 pt-1'}
    >
      {emptyState}
    </LibrarySectionList>
  )

  return (
    <div
      className={cn('relative flex min-h-0 flex-1 flex-col', className)}
      onDragEnter={handleDragOver}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      data-skill-drop-zone={dragActive ? 'active' : 'idle'}
      data-library-host={host}
    >
      {toolbarHost ? createPortal(tools, toolbarHost) : null}
      <input
        ref={fileInputRef}
        type="file"
        accept=".md,.markdown,.zip,.json,.nomiskill"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) handleImportFile(file)
          e.target.value = ''
        }}
      />
      {page ? null : (
        <div className="flex shrink-0 gap-1.5 px-3 pb-2.5">
          {search}
          <LibraryCategoryMenu groups={navGroups} value={category} onChange={setCategory} ariaLabel={t('libraries.layout.categoryMenuAria')} />
        </div>
      )}
      {receipts.length ? (
        <div className={cn('flex shrink-0 flex-col gap-0.5', page ? 'pb-3' : 'px-3 pb-2')} data-skill-receipts>
          {receipts.map(([key, message]) => <p key={key} role="status" className="m-0 text-caption text-nomi-ink-60">{message}</p>)}
        </div>
      ) : null}
      {page ? (
        <div className="flex min-h-0 flex-1 gap-7">
          <LibraryCategoryNav groups={navGroups} value={category} onChange={setCategory} ariaLabel={t('libraries.skill.categoryNavAria')} />
          {list}
        </div>
      ) : list}

      {selected ? (
        <SkillDetail
          entry={selected}
          addToChatBlockedReason={needsProjectReason}
          onClose={() => setSelected(null)}
          onAddToChat={() => { handleAddToChat(selected.skill); setSelected(null) }}
          onExport={() => { void handleExport(selected.skill) }}
          onDelete={selected.skill.origin === 'user' ? () => { void handleDelete(selected.skill); setSelected(null) } : undefined}
        />
      ) : null}

      {/* 松手区提示：只在真的拖着文件时出现，盖住整块面板，让「能不能松手」没有歧义。 */}
      {dragActive ? (
        <div
          className={cn(
            'pointer-events-none absolute inset-2 z-20 grid place-items-center gap-1 rounded-nomi',
            'border-2 border-dashed border-nomi-ink-40 bg-nomi-paper/90 text-center',
          )}
          aria-hidden="true"
        >
          <span className={cn('flex flex-col items-center gap-1.5')}>
            <IconUpload size={22} stroke={1.6} className={cn('text-nomi-accent')} />
            <span className={cn('text-body-sm font-semibold text-nomi-ink')}>{t('libraries.skill.dropHint')}</span>
            <span className={cn('text-micro text-nomi-ink-60')}>{t('libraries.skill.dropFormats')}</span>
          </span>
        </div>
      ) : null}
    </div>
  )
}
