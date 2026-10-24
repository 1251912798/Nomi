import React from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter/wght.css'
import '@fontsource-variable/fraunces/wght.css'
import '../styles/index.css'
import { NomiAppProviders } from '../NomiAppProviders'
import { NomiColorSchemeProvider } from '../theme/NomiColorSchemeProvider'
import { persistColorScheme } from '../theme/colorScheme'
import { SkillLibraryContent } from '../workbench/skillLibrary/SkillLibraryPanel'

// ShellStage specimen: the production component reads the running Electron host's real Skill DTOs.
// Both hosts side by side (2026-10-24 boards SkillLibrary + LibraryDrawers): the wide page with its tools in the tab row,
// and the 280px drawer with import / new in the drawer title row.
persistColorScheme('light')

function Specimen(): React.JSX.Element {
  const [pageTools, setPageTools] = React.useState<HTMLDivElement | null>(null)
  const [drawerTools, setDrawerTools] = React.useState<HTMLDivElement | null>(null)
  return (
    <main className="flex h-screen gap-4 bg-nomi-ink-05 p-4 text-nomi-ink">
      <section className="flex min-w-0 flex-1 flex-col gap-5 rounded-panel bg-nomi-paper px-8 pt-6 ring-1 ring-nomi-line-soft">
        <div className="flex min-h-8 shrink-0 items-center gap-x-3">
          <b className="text-title font-semibold">Skill</b>
          <div ref={setPageTools} className="contents" />
        </div>
        <SkillLibraryContent host="page" toolbarHost={pageTools} className="min-h-0 flex-1" />
      </section>
      <aside className="flex h-full w-[280px] flex-col overflow-hidden rounded-nomi-lg bg-nomi-paper shadow-nomi-lg ring-1 ring-nomi-line-soft">
        <header className="flex h-11 shrink-0 items-center gap-1.5 pl-4 pr-2">
          <h2 className="m-0 min-w-0 flex-1 truncate text-body-sm font-semibold">Skill</h2>
          <div ref={setDrawerTools} className="contents" />
        </header>
        <SkillLibraryContent host="drawer" toolbarHost={drawerTools} />
      </aside>
    </main>
  )
}

createRoot(document.getElementById('root')!).render(
  <NomiColorSchemeProvider><NomiAppProviders><Specimen /></NomiAppProviders></NomiColorSchemeProvider>,
)
