/**
 * 兼容旧主进程 import 的类型转出口；定义唯一位于 electron/shared/contracts/promptLibrary.ts。
 * 跨 IPC 的 renderer / preload / bridge 代码必须直接引用共享契约。
 */
export type {
  LibraryPrompt,
  ParsedPrompt,
  PromptMediaType,
  PromptReferenceImage,
  UserPromptRestoreSnapshot,
} from "../shared/contracts/promptLibrary";
