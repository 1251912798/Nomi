import assert from 'node:assert/strict'
import fs from 'node:fs'
import ffprobe from '@ffprobe-installer/ffprobe'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import { createC0Fixture, MODEL, shots } from './c0-fixture.mjs'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
test('C0 loopback works without system media tools, returns eight decodable clips and rejects duplicate/unknown shots', async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'c0-fixture-test-'))
  const originalPath = process.env.PATH
  process.env.PATH = temp // No system ffmpeg/ffprobe: use the declared platform binaries.
  let fixture
  try {
    fixture = await createC0Fixture(rootDir, path.join(temp, 'settings'), path.join(temp, 'media'))
    const catalog = JSON.parse(fs.readFileSync(path.join(temp, 'settings/model-catalog.json'), 'utf8'))
    const vendor = catalog.vendors.find((v) => v.key === 'c0-video-loopback')
    assert.equal(new URL(vendor.baseUrlHint).hostname, '127.0.0.1')
    const post = (prompt) => fetch(`${vendor.baseUrlHint}/v1/videos/generations`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: MODEL, prompt }),
    })
    const hashes = []
    for (const shot of shots) {
      const response = await post(shot.prompt)
      assert.equal(response.status, 200)
      const { data } = await response.json()
      assert.match(data[0].url, /^data:video\/mp4;base64,/)
      const bytes = Buffer.from(data[0].url.split(',')[1], 'base64')
      hashes.push(createHash('sha256').update(bytes).digest('hex'))
      const downloaded = path.join(temp, `response-${shot.index}.mp4`)
      fs.writeFileSync(downloaded, bytes)
      const probe = JSON.parse(execFileSync(ffprobe.path, ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', downloaded], { encoding: 'utf8' }))
      assert.equal(Number(probe.format.duration), 8)
      assert.equal(probe.streams.find((s) => s.codec_type === 'video').width, 640)
      assert.ok(probe.streams.some((s) => s.codec_type === 'audio'))
    }
    assert.equal(new Set(hashes).size, 8)
    assert.deepEqual(fixture.calls, shots.map((s) => s.index))
    assert.equal((await post(shots[0].prompt)).status, 400)
    assert.equal((await post('unknown')).status, 400)
    fixture.text.assertClean()
  } finally {
    if (originalPath === undefined) delete process.env.PATH
    else process.env.PATH = originalPath
    if (fixture) await fixture.close()
    fs.rmSync(temp, { recursive: true, force: true })
  }
})
