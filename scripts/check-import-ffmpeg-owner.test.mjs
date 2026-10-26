import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const normalizer = fs.readFileSync('electron/assets/videoImportNormalize.ts', 'utf8')

test('import normalization has one bounded process owner and no private ffmpeg spawn', () => {
  assert.doesNotMatch(normalizer, /from ["']node:child_process["']/)
  assert.doesNotMatch(normalizer, /\bspawn\s*\(/)
  assert.match(normalizer, /runBoundedProcess\(/)
  const boundedCall = normalizer.slice(normalizer.indexOf('runBoundedProcess('), normalizer.indexOf(');', normalizer.indexOf('runBoundedProcess(')))
  assert.match(boundedCall, /signal:\s*options\.signal/)
})

test('the known non-import ffmpeg spawns remain an explicit frozen baseline', () => {
  const baseline = [
    'electron/video/framesToVideo.ts',
    'electron/video/extractVideoFrame.ts',
    'electron/video/trimVideo.ts',
    'electron/video/detectShotCuts.ts',
    'electron/video/extractAudioTrack.ts',
    'electron/localSpeech/localSpeechTranscribe.ts',
    'electron/export/ffmpegRunner.ts',
    'electron/review/technicalCheck.ts',
  ]
  for (const file of baseline) assert.ok(fs.existsSync(file), `${file} disappeared; re-audit the frozen baseline`)
  assert.equal(normalizer.includes('runFfmpeg'), false)
})
