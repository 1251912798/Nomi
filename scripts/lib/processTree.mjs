import { spawnSync } from 'node:child_process'

/** 子进程必须自成进程组，超时时才能在 POSIX 上一次终止整个后代树。 */
export function processTreeSpawnOptions() {
  return process.platform === 'win32' ? {} : { detached: true }
}

/** 终止自己创建的进程及其后代；活进程不是组长时显式报调用方误用。 */
export function killProcessTree(child, signal = 'SIGKILL') {
  const pid = child?.pid
  // 测试替身没有 pid 时仍保留 ChildProcess 的信号语义；真实 spawn 必须带 pid 才能进入这里。
  if (!pid) return child?.kill?.(signal) ?? false
  try {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' })
    } else {
      process.kill(-pid, signal)
    }
    return true
  } catch (error) {
    if (error?.code === 'ESRCH') {
      if (child?.exitCode === null && child?.signalCode === null) {
        throw new Error('killProcessTree: live child is not a process-group leader; spawn it with processTreeSpawnOptions()', { cause: error })
      }
      return false
    }
    throw error
  }
}
