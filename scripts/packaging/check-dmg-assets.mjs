// check:icons 的 DMG 部分：DMG 窗口的背景和角标有没有跟上它们的源头（规格见 ./dmg-assets.mjs）。
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { auditDmgAssets } from './dmg-assets.mjs'

const result = auditDmgAssets(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'))
console.log(`DMG ASSET CHECK PASS background=${result.background}@1x+2x badge=${result.badge}`)
