import { describe, expect, it } from 'vitest'
import {
  countBucket, cpuCoresBucket, interactionBucket, isPerfSummaryProps, longFramesPerMinBucket, longestFrameBucket, memoryBucket, observedMinutesBucket,
  percentile, PERF_FIELD_VALUES, PERF_FIELDS, type PerfSummaryProps,
} from './perfTelemetry'

const valid: PerfSummaryProps = {
  interactionP75: '100-200', interactionP95: '200-500', longFramesPerMin: '1-3', longestFrame: '100-250', observedMinutes: '5-30',
  page: 'generation', nodes: '21-100', imageNodes: '1-20', generating: true, cpuCores: '9-16', memoryGb: '8plus',
}

describe('性能分桶 · 序列化白名单', () => {
  it('完整合法的汇总通过', () => {
    expect(isPerfSummaryProps(valid)).toBe(true)
  })

  it('多一个键就红（内容 / 路径 / 型号 / 原始毫秒都进不来）', () => {
    for (const extra of [{ gpu: 'NVIDIA RTX 4090' }, { projectName: 'x' }, { rawMs: 123 }, { path: 'C:/a' }]) {
      expect(isPerfSummaryProps({ ...valid, ...extra })).toBe(false)
    }
  })

  it('少一个键也红；每一格取值必须在登记表里', () => {
    for (const key of PERF_FIELDS) {
      const { [key]: _omit, ...rest } = valid
      expect(isPerfSummaryProps(rest)).toBe(false)
    }
    expect(isPerfSummaryProps({ ...valid, interactionP75: '137' })).toBe(false)
    expect(isPerfSummaryProps({ ...valid, page: '/Users/me/projects' })).toBe(false)
    expect(isPerfSummaryProps({ ...valid, generating: 'true' })).toBe(false)
    expect(isPerfSummaryProps(null)).toBe(false)
    expect(isPerfSummaryProps([])).toBe(false)
  })

  it('键集合冻结：登记表的键恰好是下面这 11 个（改它 = 改告知范围，要同时改文案与 TELEMETRY_SCOPE_VERSION）', () => {
    expect([...PERF_FIELDS].sort()).toEqual(
      ['cpuCores', 'generating', 'imageNodes', 'interactionP75', 'interactionP95', 'longFramesPerMin', 'longestFrame', 'memoryGb', 'nodes', 'observedMinutes', 'page'],
    )
    expect(Object.keys(PERF_FIELD_VALUES)).toHaveLength(11)
  })
})

describe('性能分桶 · 边界', () => {
  it('交互耗时（左闭右开）', () => {
    expect([null, 0, 99.9, 100, 199.9, 200, 499.9, 500, 5000, Number.NaN].map(interactionBucket)).toEqual(
      ['none', 'lt-100', 'lt-100', '100-200', '100-200', '200-500', '200-500', 'gt-500', 'gt-500', 'none'],
    )
  })

  it('长帧：次数按每分钟折算；最长一帧低于 50ms 视为没有', () => {
    expect([longFramesPerMinBucket(0, 10), longFramesPerMinBucket(3, 1), longFramesPerMinBucket(4, 1), longFramesPerMinBucket(10, 1), longFramesPerMinBucket(11, 1), longFramesPerMinBucket(1, 30)])
      .toEqual(['0', '1-3', '4-10', '4-10', 'gt-10', '1-3'])
    expect([null, 49, 50, 99, 100, 249, 250, 999, 1000].map(longestFrameBucket)).toEqual(['none', 'none', '50-100', '50-100', '100-250', '100-250', '250-1000', '250-1000', 'gt-1000'])
  })

  it('会话时长 / 节点数 / 核数 / 内存', () => {
    expect([0, 4.9, 5, 30, 30.1].map(observedMinutesBucket)).toEqual(['lt-5', 'lt-5', '5-30', '5-30', 'gt-30'])
    expect([0, 1, 20, 21, 100, 101, 300, 301, -1].map(countBucket)).toEqual(['0', '1-20', '1-20', '21-100', '21-100', '101-300', '101-300', 'gt-300', '0'])
    expect([undefined, 0, 2, 4, 5, 8, 9, 16, 17].map(cpuCoresBucket)).toEqual(['unknown', 'unknown', 'le4', 'le4', '5-8', '5-8', '9-16', '9-16', 'gt16'])
    expect([undefined, 0.5, 2, 4, 8].map(memoryBucket)).toEqual(['unknown', 'le2', 'le2', '4', '8plus'])
  })

  it('分位：最近秩', () => {
    expect(percentile([], 75)).toBeNull()
    expect(percentile([10], 95)).toBe(10)
    expect(percentile([10, 20, 30, 40], 75)).toBe(30)
    expect(percentile([10, 20, 30, 40], 95)).toBe(40)
  })
})
