import React from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter/wght.css'
import '@mantine/notifications/styles.css'
import '/src/styles/index.css'
import { notificationsStore } from '@mantine/notifications'
import { NomiAppProviders } from '/src/NomiAppProviders'
import { NomiColorSchemeProvider } from '/src/theme/NomiColorSchemeProvider'
import { Scene3DEnvironmentPanel } from '/src/workbench/generationCanvas/nodes/scene3d/scene3dEnvironmentPanel'
import { createDefaultScene3DState } from '/src/workbench/generationCanvas/nodes/scene3d/scene3dSerializer'
Object.assign(window, { __sceneFeedbackState: () => ({ visible: notificationsStore.getState().notifications.length, queued: notificationsStore.getState().queue.length }) })
function Stage() {
  const [environment, setEnvironment] = React.useState(() => createDefaultScene3DState().environment)
  return <main className="min-h-screen bg-nomi-bg p-8 text-nomi-ink"><div data-scene-feedback-stage className="rounded-nomi-lg border border-nomi-line bg-nomi-paper p-6" style={{ width: 340 }}><Scene3DEnvironmentPanel environment={environment} readOnly={false} onEnvironmentPatch={patch => setEnvironment(current => ({ ...current, ...patch }))} /></div></main>
}
createRoot(document.getElementById('root')!).render(<NomiColorSchemeProvider><NomiAppProviders><Stage /></NomiAppProviders></NomiColorSchemeProvider>)
