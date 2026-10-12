import { defineConfig } from 'astro/config'
import starlight from '@astrojs/starlight'
import { shared } from '../scripts/marketing/content.mjs'

// 教程站：独立构建，产物由 scripts/build-marketing-docs.mjs 拷进 marketing/（设计见 docs/plan/2026-10-10-docs-site.md）。
// 地址与现站一致：无结尾斜杠、不带 .html，中文在 /docs，英文在 /en/docs。
// build.format 用 file（产物是 docs/x.html，Cloudflare 的 auto-trailing-slash 把 /docs/x 解析过去）。
// 站内链接里的 .html 由 build-marketing-docs.mjs 统一去掉。
const section = (label, en, slugs) => ({ label, translations: { en }, items: slugs.map((slug) => ({ slug })) })

export default defineConfig({
  site: shared.siteUrl,
  // 产物必须只由 marketing-docs 自己的源码和锁文件决定：Vite 会从项目目录往上找 PostCSS 配置，不挡住的话会吃到仓库根
  // 那份 App 用的 postcss.config.js（autoprefixer，给 CSS 加 -moz- 前缀），哈希就随「根目录有没有它」而变（见 docs/plan/2026-10-10-docs-site.md）。
  vite: { css: { postcss: { plugins: [] } } },
  trailingSlash: 'never',
  build: { format: 'file' },
  integrations: [
    starlight({
      title: { 'zh-CN': 'Nomi 教程', en: 'Nomi Docs' },
      defaultLocale: 'root',
      locales: {
        root: { label: '简体中文', lang: 'zh-CN' },
        en: { label: 'English', lang: 'en' },
      },
      favicon: '/assets/nomi-logo.svg',
      customCss: ['./src/styles/nomi.css'],
      components: {
        Head: './src/components/Head.astro',
        SiteTitle: './src/components/SiteTitle.astro',
        SocialIcons: './src/components/SocialIcons.astro',
        LanguageSelect: './src/components/LanguageSelect.astro',
      },
      head: [
        { tag: 'link', attrs: { rel: 'preconnect', href: 'https://fonts.googleapis.com' } },
        { tag: 'link', attrs: { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' } },
        { tag: 'link', attrs: { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Inter:wght@400;500;600&family=Noto+Sans+SC:wght@400;500;700;900&display=swap' } },
      ],
      sidebar: [
        { slug: 'docs', label: '教程首页', translations: { en: 'Docs home' } },
        section('开始', 'Get started', ['docs/start/what-is-nomi', 'docs/start/first-project']),
        section('外部 Agent（MCP）', 'External agents (MCP)', ['docs/mcp/before-you-connect', 'docs/mcp/connect-clients', 'docs/mcp/verify-and-troubleshoot']),
      ],
    }),
  ],
})
