import { describe, expect, it } from "vitest";
import { MAX_SEGMENT_SECONDS, segmentsFromWords, withTimedSegments } from "./transcriptSegments";

// 形状照 ElevenLabs 官方 speech-to-text 文档（words[]: text/start/end/type∈word|spacing|audio_event/speaker_id，
// https://elevenlabs.io/docs/api-reference/speech-to-text/convert，2026-10-19 查）与 OpenAI 逐词（word/start/end）。
const w = (text: string, start: number, end: number, extra: Record<string, unknown> = {}) => ({ text, start, end, type: "word", speaker_id: "speaker_0", ...extra });
const sp = (start: number) => ({ text: " ", start, end: start, type: "spacing", speaker_id: "speaker_0" });

describe("转写结果统一成带时间戳句段", () => {
  it("Scribe 逐词：句末标点收句、空白保留、声音事件不进台词", () => {
    const words = [
      w("大家好，", 0.1, 0.6), w("今天", 0.6, 0.9), w("聊聊", 0.9, 1.2), w("Nomi。", 1.2, 1.6),
      { text: "(笑声)", start: 1.7, end: 2.0, type: "audio_event" },
      w("This", 2.1, 2.3), sp(2.3), w("is", 2.3, 2.4), sp(2.4), w("great!", 2.4, 2.8),
    ];
    expect(segmentsFromWords(words)).toEqual([
      { start: 0.1, end: 1.6, text: "大家好，今天聊聊Nomi。" },
      { start: 2.1, end: 2.8, text: "This is great!" },
    ]);
  });

  it("停顿与换说话人都收句；超长无标点口播被强制切开", () => {
    expect(segmentsFromWords([w("一", 0, 0.3), w("二", 2, 2.3)]).map((s) => s.text)).toEqual(["一", "二"]);
    expect(segmentsFromWords([w("一", 0, 0.3), w("二", 0.3, 0.6, { speaker_id: "speaker_1" })]).map((s) => s.text)).toEqual(["一", "二"]);
    const long = Array.from({ length: 60 }, (_, i) => w("字", i * 0.5, i * 0.5 + 0.5));
    const segments = segmentsFromWords(long);
    expect(segments.length).toBeGreaterThan(1);
    expect(segments.every((s) => s.end - s.start <= MAX_SEGMENT_SECONDS)).toBe(true);
  });

  it("OpenAI 逐词（word 字段、无 spacing）：英文补空格、中文不补", () => {
    expect(segmentsFromWords([{ word: "hello", start: 0, end: 0.3 }, { word: "world.", start: 0.3, end: 0.6 }])[0].text).toBe("hello world.");
    expect(segmentsFromWords([{ word: "你好", start: 0, end: 0.3 }, { word: "世界", start: 0.3, end: 0.6 }])[0].text).toBe("你好世界");
  });

  it("已有 segments 原样不动；两样都没有原样返回（不编时间）", () => {
    const whisper = { text: "x", segments: [{ start: 0, end: 1, text: "x" }] };
    expect(withTimedSegments(whisper)).toBe(whisper);
    const untimed = { text: "只有文字" };
    expect(withTimedSegments(untimed)).toBe(untimed);
    const scribe = { text: "好。", words: [w("好。", 0, 0.4)] };
    expect(withTimedSegments(scribe)).toMatchObject({ text: "好。", words: scribe.words, segments: [{ start: 0, end: 0.4, text: "好。" }] });
  });
});
