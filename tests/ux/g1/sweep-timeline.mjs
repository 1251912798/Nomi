import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import ffprobe from '@ffprobe-installer/ffprobe'
import ffmpeg from '@ffmpeg-installer/ffmpeg'
import { expect, clickOrFail } from '../_assert.mjs'
import { writeJson } from './sweep-evidence.mjs'

export async function sweepTimeline({ station, win, input, directory, payload }) {
  const clips = p => p.timeline.tracks.flatMap(t => t.clips).filter(c => c.type === 'image')
  const count = input.scenario === 'two-images' ? 2 : input.scenario === 'single-image' ? 1 : 0
  if (count) await station('timeline-import', `从真实图片节点加入 ${count} 段图片`, async () => {
    const file = path.resolve(directory, 'timeline-reference.jpg')
    fs.copyFileSync(new URL('../../../resources/onboarding-demo/shot-4.jpg', import.meta.url), file)
    await win.locator('.generation-canvas-v2__stage input[type="file"][accept="image/*,video/*"]').first().setInputFiles(file)
    await expect.poll(async () => (await payload()).generationCanvas.nodes.some(n => n.result?.url?.startsWith('nomi-local://')), { timeout: 10000 }).toBe(true)
    const imported = (await payload()).generationCanvas.nodes.find(n => n.result?.url?.startsWith('nomi-local://'))
    const node = win.locator(`[data-node-id="${imported.id}"]`)
    for (let index = 0; index < count; index++) {
      await node.click({ position: { x: 35, y: 16 } })
      await clickOrFail(node.locator('[aria-label*="加入时间轴"]').first(), `图片 ${index + 1} 入轴`)
      await expect.poll(async () => clips(await payload()).length).toBe(index + 1)
    }
  })
  await station('timeline-preview', `预览包含 ${count} 段图片的时间轴`, async () => {
    await clickOrFail(win.locator('[aria-label="工作区切换"]').getByText('预览', { exact: true }), '预览')
    await expect(win.locator('[data-workspace-mode="preview"]')).toBeVisible()
    const actual = clips(await payload())
    expect(actual).toHaveLength(count)
    for (const [index, clip] of actual.entries()) {
      expect(clip.endFrame).toBeGreaterThan(clip.startFrame)
      expect(clip.startFrame).toBe(index ? actual[index - 1].endFrame : 0)
    }
  })
  if (input.surface !== 'export') return
  await station('export', count ? `${count} 段图片经真实导出得到可解码 MP4` : '空时间轴明确拒绝导出', async () => {
    await clickOrFail(win.locator('[aria-label="导出 MP4"]').first(), '导出 MP4')
    if (!count) {
      await expect(win.getByText('时间轴为空，无法导出', { exact: true })).toBeVisible()
      return
    }
    const profile = path.join(directory, 'profile')
    let file, probe
    await expect.poll(() => {
      file = fs.readdirSync(profile, { recursive: true }).find(f => f.endsWith('.mp4') && f.split(path.sep).includes('exports'))
      if (!file) return false
      try {
        probe = JSON.parse(execFileSync(ffprobe.path, ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', path.join(profile, file)], { encoding: 'utf8' }))
        return Boolean(probe.streams?.some(s => s.codec_type === 'video'))
      } catch { return false }
    }, { timeout: 60000 }).toBe(true)
    const p = await payload(), duration = clips(p).at(-1).endFrame / p.timeline.fps
    expect(Number(probe.format.duration)).toBeCloseTo(duration, 0)
    execFileSync(ffmpeg.path, ['-v', 'error', '-xerror', '-i', path.join(profile, file), '-f', 'null', '-'], { stdio: 'pipe' })
    writeJson(path.join(directory, 'export.json'), { path: file, probe })
  })
}
