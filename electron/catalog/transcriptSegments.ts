// 转写结果的**带时间戳句段**——所有转写供应商出口的同一形状（2026-10-19）。
//
// Nomi 里读转写结果的人只认一种形状：`raw.segments: [{ start, end, text }]`（Whisper `verbose_json` 那一种；
// 本机 whisper-cpp 那条线也照它出，见 localSpeech/localSpeechSegments.ts）。拆解按它把台词分到镜头，
// 音频节点按它导 SRT。
//
// 但不是每家都回 segments：ElevenLabs Scribe（POST /v1/speech-to-text）回的是逐词 `words: [{ text, start, end, type }]`，
// OpenAI 的 `timestamp_granularities=word` 也是逐词（`word` 字段）。以前这类响应原样透传——拆解读不到 segments，
// 对白列整列空白、**一句原因都没有**。这里在执行器出口（audioTaskRunner.runTranscribe）把逐词收成句段，
// 让读的人永远只面对一种形状；已有 segments 的响应原样不动。
//
// 收句规则（只用响应里自带的信号，不猜语言）：句末标点收句；两词间停顿超过 PAUSE_SECONDS 收句；
// 说话人变了收句；一句超过 MAX_SEGMENT_SECONDS 强制收句（防一整段没有标点的口播变成一句，分不到镜头上）。
// 声音事件（`type: "audio_event"`，如「(笑声)」）不是台词，不进句段。
import { isJsonRecord, type JsonRecord } from "../jsonUtils";

export type TimedSegment = { start: number; end: number; text: string };

export const PAUSE_SECONDS = 0.8;
export const MAX_SEGMENT_SECONDS = 12;
const SENTENCE_END = /[。！？!?．.…]["'”’」』)）]*$/u;

type TimedWord = { text: string; start: number; end: number; speaker: string; spacing: boolean };

function wordsOf(raw: unknown): TimedWord[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    if (!isJsonRecord(item)) return [];
    if (item.type === "audio_event") return [];
    const text = typeof item.text === "string" ? item.text : typeof item.word === "string" ? item.word : "";
    const start = Number(item.start);
    const end = Number(item.end);
    if (!text || !Number.isFinite(start)) return [];
    return [{ text, start, end: Number.isFinite(end) ? end : start, speaker: typeof item.speaker_id === "string" ? item.speaker_id : "", spacing: item.type === "spacing" || !text.trim() }];
  });
}

/** 逐词 → 句段（纯函数）。没有可用的逐词时间戳返回空数组。 */
export function segmentsFromWords(raw: unknown): TimedSegment[] {
  const segments: TimedSegment[] = [];
  let current: { start: number; end: number; parts: string[]; speaker: string } | null = null;
  const flush = () => {
    const text = current?.parts.join("").trim();
    if (current && text) segments.push({ start: current.start, end: current.end, text });
    current = null;
  };
  // `type` 缺省的逐词（OpenAI `word`）之间没有显式空白：英文要补空格，中文不补。
  const needsSpace = (prev: string, next: string) => /[\p{L}\p{N}]$/u.test(prev) && /^[\p{L}\p{N}]/u.test(next)
    && !/\p{Script=Han}$/u.test(prev) && !/^\p{Script=Han}/u.test(next);
  for (const word of wordsOf(raw)) {
    if (word.spacing) {
      if (current) current.parts.push(word.text);
      continue;
    }
    if (current && (word.start - current.end > PAUSE_SECONDS || word.speaker !== current.speaker || word.end - current.start > MAX_SEGMENT_SECONDS)) flush();
    if (!current) current = { start: word.start, end: word.end, parts: [], speaker: word.speaker };
    const last = current.parts.at(-1) ?? "";
    if (last && needsSpace(last, word.text)) current.parts.push(" ");
    current.parts.push(word.text);
    current.end = Math.max(current.end, word.end);
    if (SENTENCE_END.test(word.text.trim())) flush();
  }
  flush();
  return segments;
}

/**
 * 转写响应 → 带 segments 的同一形状。已有非空 segments 原样返回；只有逐词的补出 segments（逐词原样保留）。
 * 两样都没有就原样返回——「有文字没时间戳」由读的人（拆解）诚实说出来，这里不编时间。
 */
export function withTimedSegments(response: unknown): unknown {
  if (!isJsonRecord(response)) return response;
  if (Array.isArray(response.segments) && response.segments.length > 0) return response;
  const segments = segmentsFromWords(response.words);
  return segments.length ? ({ ...response, segments } as JsonRecord) : response;
}
