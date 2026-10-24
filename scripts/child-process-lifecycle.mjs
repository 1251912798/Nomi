function hasExited(child) {
  return child.exitCode !== null || child.signalCode !== null;
}

export function installChildProcessLifecycle(host = process, options = {}) {
  const children = new Set();
  const sentSignals = new Map();
  const forceAfterMs = options.forceAfterMs ?? 2_000;
  const schedule = options.schedule ?? setTimeout;
  const clear = options.clear ?? clearTimeout;
  let forceTimer = null;
  let requestedExitCode = null;
  let shuttingDown = false;

  const sendSignal = (child, signal) => {
    if (hasExited(child)) return;
    const childSignals = sentSignals.get(child) ?? new Set();
    if (childSignals.has(signal)) return;
    childSignals.add(signal);
    sentSignals.set(child, childSignals);
    try {
      child.kill(signal);
    } catch {
      // 退出路径必须 best-effort；子进程可能刚好在探测与 kill 之间结束。
    }
  };

  const terminateChildren = (signal) => {
    for (const child of children) {
      sendSignal(child, signal);
    }
  };

  const finishShutdown = () => {
    if (!shuttingDown || children.size > 0 || requestedExitCode === null) return;
    if (forceTimer !== null) {
      clear(forceTimer);
      forceTimer = null;
    }
    host.exit(requestedExitCode);
  };

  const requestShutdown = (signal, exitCode) => {
    if (shuttingDown) return;
    shuttingDown = true;
    requestedExitCode = exitCode;
    terminateChildren(signal);
    if (children.size === 0) {
      finishShutdown();
      return;
    }
    forceTimer = schedule(() => {
      forceTimer = null;
      terminateChildren("SIGKILL");
      host.exit(exitCode);
    }, forceAfterMs);
  };

  const onSigint = () => requestShutdown("SIGINT", 130);
  const onSigterm = () => requestShutdown("SIGTERM", 143);
  const onExit = () => {
    if (shuttingDown) return;
    terminateChildren("SIGTERM");
  };

  host.once("SIGINT", onSigint);
  host.once("SIGTERM", onSigterm);
  host.once("exit", onExit);

  return {
    track(child) {
      children.add(child);
      sentSignals.set(child, new Set());
      child.once("exit", () => {
        children.delete(child);
        sentSignals.delete(child);
        finishShutdown();
      });
      return child;
    },
    isShuttingDown() {
      return shuttingDown;
    },
    shutdown(signal = "SIGTERM", exitCode = 0) {
      requestShutdown(signal, exitCode);
    },
    dispose() {
      host.off("SIGINT", onSigint);
      host.off("SIGTERM", onSigterm);
      host.off("exit", onExit);
      if (forceTimer !== null) clear(forceTimer);
      forceTimer = null;
      children.clear();
      sentSignals.clear();
    },
  };
}
