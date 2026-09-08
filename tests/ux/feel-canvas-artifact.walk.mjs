#!/usr/bin/env node
import fs from 'node:fs'
import assert from 'node:assert/strict'
import { scanFeel } from './_feel.mjs'
const catalog=JSON.parse(fs.readFileSync(new URL('./journeys/catalog.json',import.meta.url)))
assert.ok(catalog.journeys.some(j=>j.id.includes('canvas')||j.id.includes('canvas-artifact')))
assert.equal(typeof scanFeel,'function')
console.log('feel coverage: canvas-artifact')
