import assert from 'node:assert/strict'
import test from 'node:test'
import { cleanInternalLinks, isDocsHtml, logicalAssetName, manifestFromHtmlPaths, missingAstroReferences, missingPagefindReferences, normalizeBundlerHashes } from './docs-site.mjs'

test('cleanInternalLinks strips .html from internal links only, keeping anchors', () => {
  const html = '<a href="/docs/start/first-project.html#steps">a</a><a href="/en/docs.html">b</a><a href="https://example.com/x.html">c</a><a href="#top">d</a><a href="/index.html">e</a>'
  assert.equal(
    cleanInternalLinks(html),
    '<a href="/docs/start/first-project#steps">a</a><a href="/en/docs">b</a><a href="https://example.com/x.html">c</a><a href="#top">d</a><a href="/">e</a>',
  )
})

test('isDocsHtml only claims docs pages, not 404 or other site pages', () => {
  for (const yes of ['docs.html', 'docs/a/b.html', 'en/docs.html', 'en/docs/a.html']) assert.equal(isDocsHtml(yes), true, yes)
  for (const no of ['404.html', 'index.html', 'models.html', 'docs-x.html', 'en/index.html', 'docs/a.txt']) assert.equal(isDocsHtml(no), false, no)
})

test('manifestFromHtmlPaths pairs zh and en pages and refuses an unpaired page', () => {
  assert.deepEqual(
    manifestFromHtmlPaths(['en/docs.html', 'docs.html', 'docs/a.html', 'en/docs/a.html']),
    [
      { zh: 'marketing/docs.html', en: 'marketing/en/docs.html' },
      { zh: 'marketing/docs/a.html', en: 'marketing/en/docs/a.html' },
    ],
  )
  assert.throws(() => manifestFromHtmlPaths(['docs.html', 'en/docs.html', 'docs/a.html']), /成对/)
  assert.throws(() => manifestFromHtmlPaths(['docs.html', 'en/docs.html', 'en/docs/b.html']), /成对/)
})

test('normalizeBundlerHashes erases bundler hashes but keeps page content', () => {
  const a = '<link href="/_astro/common.KRJgqbup.css"><div class="astro-2xfzmn55 x">文字</div><script src="/_astro/ui-core.Clh5jUUO.js">'
  const b = '<link href="/_astro/common.y1p1JTPO.css"><div class="astro-ofbg3qve x">文字</div><script src="/_astro/ui-core.AAAAAAAA.js">'
  assert.equal(normalizeBundlerHashes(a), normalizeBundlerHashes(b))
  assert.notEqual(normalizeBundlerHashes(a), normalizeBundlerHashes(b.replace('文字', '别的字')))
})

test('logicalAssetName makes a Windows-built and a Linux-built style file the same logical file', () => {
  assert.equal(logicalAssetName('_astro/common.KRJgqbup.css'), logicalAssetName('_astro/common.y1p1JTPO.css'))
  assert.notEqual(logicalAssetName('_astro/common.KRJgqbup.css'), logicalAssetName('_astro/print.KRJgqbup.css'))
  assert.notEqual(logicalAssetName('_astro/common.KRJgqbup.css'), logicalAssetName('_astro/common.KRJgqbup.js'))
})

test('missingAstroReferences reports a page that points at a style file that is not on disk', () => {
  const pages = new Map([['docs.html', '<link href="/_astro/common.KRJgqbup.css"><script src="/_astro/ui-core.Clh5jUUO.js">']])
  assert.deepEqual(missingAstroReferences(pages, ['common.KRJgqbup.css', 'ui-core.Clh5jUUO.js']), [])
  assert.deepEqual(missingAstroReferences(pages, ['common.y1p1JTPO.css', 'ui-core.Clh5jUUO.js']), ['docs.html → _astro/common.KRJgqbup.css'])
})

test('logicalAssetName also unifies Pagefind index/meta names but keeps content-hashed fragments exact', () => {
  assert.equal(logicalAssetName('pagefind/index/en_cdcf5a8.pf_index'), logicalAssetName('pagefind/index/en_235b578.pf_index'))
  assert.notEqual(logicalAssetName('pagefind/index/en_cdcf5a8.pf_index'), logicalAssetName('pagefind/index/zh-cn_cdcf5a8.pf_index'))
  assert.equal(logicalAssetName('pagefind/pagefind.en_b0fff2f2d8.pf_meta'), logicalAssetName('pagefind/pagefind.en_ea867f7b82.pf_meta'))
  assert.equal(logicalAssetName('pagefind/fragment/en_10afc29.pf_fragment'), 'pagefind/fragment/en_10afc29.pf_fragment')
})

test('missingPagefindReferences reports a search entry whose language metadata file is gone', () => {
  const entry = JSON.stringify({ languages: { en: { hash: 'en_b0fff2f2d8' }, 'zh-cn': { hash: 'zh-cn_a919914f4f27f' } } })
  assert.deepEqual(missingPagefindReferences(entry, ['pagefind.en_b0fff2f2d8.pf_meta', 'pagefind.zh-cn_a919914f4f27f.pf_meta']), [])
  assert.deepEqual(missingPagefindReferences(entry, ['pagefind.en_b0fff2f2d8.pf_meta']), ['pagefind-entry.json → pagefind/pagefind.zh-cn_a919914f4f27f.pf_meta'])
})
