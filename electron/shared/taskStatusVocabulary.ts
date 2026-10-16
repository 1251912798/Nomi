// 上游任务状态词表——**全仓唯一一份**（electron-free：主进程两台引擎、渲染层都可引）。
//
// 为什么（#1213 类根因）：此前同一件事有四张表——引擎 A `resolveTaskStatus` 的通用词表、引擎 B
// `generationRuntimeAdapter` 的 PROVIDER_TASK_STATE_BY_STATUS、`productionGenerationSubmission` 的
// PROVIDER_STATUS_CLASSES、`apimartGenerationProvider.reconcile` 的 knownStatuses。各自漏不同的词：
// 引擎 A 不认 submitted / created / not_start，引擎 B 不认 finished / in_queue……同一个上游动词，
// 走画布是「还在跑」，走制作 Run 是「需要人工核对」。词表收成一张，四处都只问它。
//
// 词来自各家真实写法（官方源码 / 文档 / 仓库里的真实记录）：
//   new-api：NOT_START / SUBMITTED / QUEUED / IN_PROGRESS / SUCCESS / FAILURE / UNKNOWN（model/task.go）
//   方舟：queued / running / succeeded / failed / expired / cancelled（doc 82379/1520757）
//   OpenAI-video：queued / in_progress / completed / failed（new-api dto/openai_video.go）
//   fal：IN_QUEUE / IN_PROGRESS / COMPLETED / FAILED；Runway：PENDING / RUNNING / SUCCEEDED / FAILED / THROTTLED
//   KIE：waiting / queuing / generating / success / fail；APIMart：submitted / in_progress / completed / failed
// 大小写不敏感。**认不出的词不当失败**（`unknown`）：失败要上游明说，猜错的代价是一次已付费的生成。

export type UpstreamTaskStatusClass = "queued" | "running" | "succeeded" | "failed" | "cancelled" | "unknown";

const VOCABULARY: Readonly<Record<Exclude<UpstreamTaskStatusClass, "unknown">, readonly string[]>> = {
  queued: [
    "queued", "queuing", "queueing", "queue", "pending", "waiting", "in_queue", "submitted", "create", "created",
    "not_start", "notstart", "not_started", "starting", "throttled", "accepted", "scheduled",
  ],
  running: [
    "running", "processing", "in_progress", "in-progress", "inprogress", "generating", "started",
    "downloading", "validating", "rendering",
  ],
  // stop / length 是 chat/completions 的 finish_reason（同步改图走那条路时状态就从这里来）。
  succeeded: ["succeeded", "succeed", "success", "successful", "completed", "complete", "done", "finished", "finish", "stop", "length"],
  failed: [
    "failed", "fail", "failure", "error", "errored", "rejected", "refused", "expired", "aborted",
    "timeout", "timed_out", "revoked",
  ],
  cancelled: ["cancelled", "canceled", "cancel"],
};

const CLASS_BY_WORD: ReadonlyMap<string, Exclude<UpstreamTaskStatusClass, "unknown">> = new Map(
  (Object.entries(VOCABULARY) as Array<[Exclude<UpstreamTaskStatusClass, "unknown">, readonly string[]]>)
    .flatMap(([cls, words]) => words.map((word) => [word, cls] as const)),
);

/** 上游原样的状态词 → 归类。空串 / 认不出 → `unknown`（调用方决定继续等还是交人，绝不当失败）。 */
export function classifyUpstreamTaskStatus(raw: unknown): UpstreamTaskStatusClass {
  const word = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (!word) return "unknown";
  return CLASS_BY_WORD.get(word) ?? "unknown";
}
