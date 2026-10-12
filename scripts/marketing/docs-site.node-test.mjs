import assert from 'node:assert/strict'
import test from 'node:test'
import { cleanInternalLinks, isDocsHtml, manifestFromHtmlPaths, normalizeBundlerHashes } from './docs-site.mjs'

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
