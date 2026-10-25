// 门岗（I-3d-ref）：预演 / 运镜小片挂到视频镜头，只有一个入口——attachCameraMoveForNode。
// 它读画布上此刻的节点与连线（实际发送的参考顺序靠这个），再交给唯一的纯核 computeAttachCameraMove 判断「挂没挂上、挂几号」。
// 以前三个调用方（出成片 / 预演写回 / 运镜小片 Host）各自拿节点调核，其中「出成片」还在核外自己看网址标记早退：
// 换模型、删参考之后标记还在，核根本没机会重新判断。现在：生产代码里调核的只有包装；谁都不许再自己读标记。
// 站位参考图接目标镜头同理（2026-10-24 走查 ⑤）：写 composition_ref 边的只有 attachStagingReference（连完再读画布），
// 「连到镜头」这句承诺只由同一个判据给出——Host 自己连不看结果、回执自己无条件许诺，两样都写不回来。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const here = path.dirname(fileURLToPath(import.meta.url))
const srcRoot = path.resolve(here, '../../../../..')

function productionSources(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) productionSources(full, out)
    else if (/\.(ts|tsx)$/.test(entry.name) && !/\.(test|spec)\.(ts|tsx)$/.test(entry.name)) out.push(full)
  }
  return out
}

function filesMatching(pattern: RegExp): string[] {
  return productionSources(srcRoot)
    .filter((file) => pattern.test(fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')))
    .map((file) => path.basename(file))
    .sort()
}

describe('预演 / 运镜挂接只有一个入口', () => {
  it('生产代码里调用核 computeAttachCameraMove 的只有包装 attachCameraMoveForNode', () => {
    expect(filesMatching(/\bcomputeAttachCameraMove\s*\(/)).toEqual(['attachCameraMoveForNode.ts', 'attachCameraMoveToTarget.ts'])
  })

  it('「当前已挂的网址标记」只有核自己读写：上层不许拿它早退', () => {
    expect(filesMatching(/\bCAMERA_MOVE_ATTACHED_URL_KEY\b|\bcameraMoveAttachedUrl\b/)).toEqual(['attachCameraMoveToTarget.ts'])
  })

  it('标记的只读口只给删参考认「删的是不是挂着的预演」：调 lastAttachedCameraMoveUrl 的只有删参考写口', () => {
    expect(filesMatching(/\blastAttachedCameraMoveUrl\s*\(/)).toEqual(['attachCameraMoveToTarget.ts', 'referenceWrites.ts'])
  })
})

describe('站位参考图接目标镜头只有一扇门', () => {
  it('生产代码里用 connectNodes 写 composition_ref 边的只有 createStagingReferenceNode.ts（attachStagingReference）', () => {
    expect(filesMatching(/\bconnectNodes\s*\([^)]*['"]composition_ref['"]/)).toEqual(['createStagingReferenceNode.ts'])
  })

  it('「连到镜头作 composition_ref」这句回执只由 stagingAttachReceipt 按判据给出', () => {
    expect(filesMatching(/连到镜头作 composition_ref/)).toEqual(['createStagingReferenceNode.ts'])
  })
})

// Host 在画布背后跑，说话的对象（出的图、挂接的目标镜头）常在视口外：提示只有一个出口 notifyHostOutcome（后台档 +「定位节点」）。
// 以前运镜 Host 用旧 toast() 只说一句、没有去处，站位 Host 自己拼 notify——同一类提示两种写法（2026-10-24 走查 ⑤ 的同类残留）。
describe('导演台 Host 只经一个提示出口说话', () => {
  const stripComments = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  const hostFiles = fs.readdirSync(here).filter((name) => /Host\.tsx$/.test(name)).sort()

  it('agent 目录下的常驻 Host 就是这两个（新增 Host 要进这张表）', () => {
    expect(hostFiles).toEqual(['CameraMoveCaptureHost.tsx', 'StagingCaptureHost.tsx'])
  })

  it.each(hostFiles)('%s 不自己引 toast / notify、不自己发定位事件，提示只走 notifyHostOutcome', (name) => {
    const source = stripComments(fs.readFileSync(path.join(here, name), 'utf8'))
    expect(source).not.toMatch(/from\s+['"][^'"]*\/ui\/toast['"]/)
    expect(source).not.toMatch(/from\s+['"][^'"]*\/ui\/notificationPolicy['"]/)
    expect(source).not.toMatch(/\bFOCUS_GENERATION_NODE_EVENT\b/)
    expect(source).toMatch(/\bnotifyHostOutcome\s*\(/)
  })
})
