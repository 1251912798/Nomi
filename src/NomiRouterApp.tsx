import React from 'react'
import { getDesktopBridge } from './desktop/bridge'
import { notifyModelOptionsRefresh } from './config/modelCatalogCache'
import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { NomiLoadingMark } from './design'
import { buildStudioUrl } from './utils/appRoutes'
import { getAppRoutePath } from './utils/routes'
import { lazyWithChunkBoundary } from './ui/chunkBoundary'
import { useTranslation } from 'react-i18next'

const NomiStudioApp = lazyWithChunkBoundary('i18n:router.mainInterface', () => import('./workbench/NomiStudioApp'))

function RedirectToStudio(): JSX.Element {
  const location = useLocation()
  return <Navigate to={`${buildStudioUrl()}${location.search || ''}`} replace />
}

function RouteLoading(): JSX.Element {
  const { t } = useTranslation()
  return (
    <div
      className="grid h-screen w-screen place-items-center bg-nomi-bg text-nomi-ink font-nomi-sans"
      aria-label={t('router.loading')}
    >
      {/* pending 规范 #1:统一品牌 spinner,杀自写 CSS 圆环 */}
      <NomiLoadingMark size={28} label={t('router.loading')} />
    </div>
  )
}

export default function NomiRouterApp(): JSX.Element {
  React.useEffect(() => {
    const refresh = (): void => notifyModelOptionsRefresh('all')
    window.addEventListener('nomi-model-catalog-changed', refresh)
    const unsubscribe = getDesktopBridge()?.modelCatalog.onChanged?.(() => window.dispatchEvent(new Event('nomi-model-catalog-changed')))
    return () => { unsubscribe?.(); window.removeEventListener('nomi-model-catalog-changed', refresh) }
  }, [])
  return (
    <HashRouter>
      <Routes>
        <Route
          path={getAppRoutePath('NomiStudioApp')}
          element={(
            <React.Suspense fallback={<RouteLoading />}>
              <NomiStudioApp />
            </React.Suspense>
          )}
        />
        <Route path={getAppRoutePath('RedirectToStudio', '/')} element={<RedirectToStudio />} />
        <Route path={getAppRoutePath('RedirectToStudio', '/workspace/*')} element={<RedirectToStudio />} />
        <Route path={getAppRoutePath('RedirectToStudio', '*')} element={<RedirectToStudio />} />
      </Routes>
    </HashRouter>
  )
}
