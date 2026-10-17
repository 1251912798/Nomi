import type { LeaferApp, LeaferEditorOverlay, LeaferEditorOverlayState } from './whiteboardCanvasTypes'
import i18n from '../../../../i18n'

export function fitLeaferCanvasToHost(app: LeaferApp): void {
  const canvasView = app.canvas?.view as HTMLElement | undefined
  if (!canvasView) {
    return
  }

  canvasView.style.width = '100%'
  canvasView.style.height = '100%'
  canvasView.style.maxWidth = '100%'
  canvasView.style.maxHeight = '100%'
}

export function createViewportScreenshotFilename(): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')

  return `nomi-whiteboard-${timestamp}.png`
}

export async function exportViewportWithoutEditorOverlays(app: LeaferApp, filename: string) {
  const editor = app.editor as LeaferEditorOverlay | undefined
  const overlayState = hideEditorOverlays(editor)

  try {
    return await app.export(filename, {
      screenshot: true,
      pixelRatio: getViewportScreenshotPixelRatio(app.width, app.height)
    })
  } finally {
    restoreEditorOverlays(editor, overlayState)
  }
}

export async function exportViewportFileWithoutEditorOverlays(app: LeaferApp, filename: string): Promise<File> {
  const editor = app.editor as LeaferEditorOverlay | undefined
  const overlayState = hideEditorOverlays(editor)

  try {
    const result = await app.export('png', {
      blob: true,
      screenshot: true,
      pixelRatio: getViewportScreenshotPixelRatio(app.width, app.height)
    })

    if (result.error) {
      throw result.error instanceof Error
        ? result.error
        : new Error(i18n.t('generationCommon.whiteboard.imageReadFailed'))
    }

    if (!(result.data instanceof Blob)) {
      throw new Error(i18n.t('generationCommon.whiteboard.imageReadFailed'))
    }

    return new File([result.data], ensurePngFilename(filename), {
      type: result.data.type || 'image/png'
    })
  } finally {
    restoreEditorOverlays(editor, overlayState)
  }
}

export function hideEditorOverlays(editor: LeaferEditorOverlay | undefined): LeaferEditorOverlayState {
  if (!editor) {
    return {}
  }

  const state = {
    visible: editor.visible
  }

  editor.visible = false

  return state
}

export function restoreEditorOverlays(editor: LeaferEditorOverlay | undefined, state: LeaferEditorOverlayState): void {
  if (!editor) {
    return
  }

  editor.visible = state.visible
}

export const WHITEBOARD_PREVIEW_PIXEL_BUDGET = 4_000_000
export const WHITEBOARD_EXPORT_PIXEL_BUDGET = 16_000_000

function budgetedPixelRatio(width: number, height: number, budget: number, dpr: number): number {
  const safeDpr = Number.isFinite(dpr) && dpr > 0 ? dpr : 1
  const pixels = Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0 ? width * height : 1
  return Math.min(2, safeDpr, Math.sqrt(budget / pixels))
}

export function getWhiteboardPreviewPixelRatio(width: number, height: number, dpr = window.devicePixelRatio || 1): number {
  return budgetedPixelRatio(width, height, WHITEBOARD_PREVIEW_PIXEL_BUDGET, dpr)
}

export function getViewportScreenshotPixelRatio(width = 1280, height = 720, dpr = window.devicePixelRatio || 1): number {
  return budgetedPixelRatio(width, height, WHITEBOARD_EXPORT_PIXEL_BUDGET, dpr)
}

export function ensurePngFilename(filename: string): string {
  return /\.png$/i.test(filename) ? filename : `${filename}.png`
}
