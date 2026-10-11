import { encodeMention } from '../shared/storyboard/promptMentions'
import { describe, expect, it, vi } from "vitest";
import {
  buildAgentUserContent,
  projectAgentPromptForSend,
  modelSupportsImageInput,
  modelSupportsPdfInput,
} from "./agentUserContent";

const bytes = (): Uint8Array => new Uint8Array([1, 2, 3]);

describe("modelSupportsImageInput", () => {
  it("honors explicit meta.supportsImageInput", () => {
    expect(modelSupportsImageInput("whatever", null, { supportsImageInput: true })).toBe(true);
    expect(modelSupportsImageInput("gpt-4o", null, { supportsImageInput: false })).toBe(false);
  });
  it("detects known vision families by name", () => {
    expect(modelSupportsImageInput("gpt-4o", null, undefined)).toBe(true);
    expect(modelSupportsImageInput("claude-3-5-sonnet", null, undefined)).toBe(true);
    expect(modelSupportsImageInput("gemini-2.0-flash", null, undefined)).toBe(true);
  });
  it("returns false for plain text models", () => {
    expect(modelSupportsImageInput("deepseek-chat", null, undefined)).toBe(false);
    expect(modelSupportsImageInput("moonshot-v1-8k", null, undefined)).toBe(false);
  });
});

describe("modelSupportsPdfInput", () => {
  it("honors meta + detects pdf-capable families", () => {
    expect(modelSupportsPdfInput("x", null, { supportsPdfInput: true })).toBe(true);
    expect(modelSupportsPdfInput("claude-3-5-sonnet", null, undefined)).toBe(true);
    expect(modelSupportsPdfInput("gpt-4o", null, undefined)).toBe(true);
    expect(modelSupportsPdfInput("claude-3-haiku", null, undefined)).toBe(false);
    expect(modelSupportsPdfInput("deepseek-chat", null, undefined)).toBe(false);
  });
});

describe("buildAgentUserContent", () => {
  const base = {
    supportsImageInput: true,
    supportsPdfInput: true,
    resolveBytes: bytes,
    extractText: async () => null,
  };

  it("returns plain string when no attachments", async () => {
    expect(await buildAgentUserContent({ prompt: "hi", ...base })).toBe("hi");
  });

  it("builds text + image part when model supports image", async () => {
    const content = await buildAgentUserContent({
      prompt: "看这张图",
      attachments: [{ url: "u", contentType: "image/png", fileName: "a.png", kind: "image" }],
      ...base,
    });
    const parts = content as Array<{ type: string }>;
    expect(parts[0]).toMatchObject({ type: "text", text: "看这张图" });
    expect(parts[1]).toMatchObject({ type: "image", mimeType: "image/png" });
  });

  it("builds file part for PDF when supported", async () => {
    const content = await buildAgentUserContent({
      prompt: "读这份 PDF",
      attachments: [{ url: "u", contentType: "application/pdf", fileName: "s.pdf", kind: "file" }],
      ...base,
    });
    const parts = content as Array<{ type: string }>;
    expect(parts[1]).toMatchObject({ type: "file", mimeType: "application/pdf" });
  });

  it("keeps a PDF filename with its bytes when a preceding attachment cannot be read", async () => {
    const content = await buildAgentUserContent({
      prompt: "read",
      ...base,
      attachments: [
        { url: "missing", contentType: "application/pdf", fileName: "missing.pdf", kind: "file" },
        { url: "present", contentType: "application/pdf", fileName: "actual.pdf", kind: "file" },
      ],
      resolveBytes: (url) => url === "present" ? bytes() : null,
    });
    expect(content).toEqual([
      expect.objectContaining({ type: "text" }),
      { type: "file", data: bytes(), mimeType: "application/pdf", fileName: "actual.pdf" },
    ]);
  });

  it("drops PDF + notes when model lacks pdf support", async () => {
    const content = await buildAgentUserContent({
      prompt: "读这份 PDF",
      attachments: [{ url: "u", contentType: "application/pdf", fileName: "s.pdf", kind: "file" }],
      ...base,
      supportsPdfInput: false,
    });
    expect(typeof content).toBe("string");
    expect(content as string).toContain("不支持 PDF");
  });

  it("drops images + notes when model lacks image support", async () => {
    const content = await buildAgentUserContent({
      prompt: "看图",
      attachments: [{ url: "u", contentType: "image/png", fileName: "a.png", kind: "image" }],
      ...base,
      supportsImageInput: false,
    });
    expect(content as string).toContain("不支持图片输入");
  });

  it("drops media when resolveBytes returns null", async () => {
    const content = await buildAgentUserContent({
      prompt: "p",
      attachments: [{ url: "missing", contentType: "image/png", fileName: "a.png", kind: "image" }],
      ...base,
      resolveBytes: () => null,
    });
    expect(content as string).toContain("读取失败");
  });

  it("injects extracted document text into the prompt", async () => {
    const content = await buildAgentUserContent({
      prompt: "读这个",
      attachments: [{ url: "u", contentType: "text/plain", fileName: "note.txt", kind: "file" }],
      ...base,
      extractText: async () => "这是文档正文",
    });
    expect(typeof content).toBe("string");
    expect(content as string).toContain("[附件文档内容]");
    expect(content as string).toContain("〈note.txt〉");
    expect(content as string).toContain("这是文档正文");
  });

  it("notes documents that fail to extract", async () => {
    const content = await buildAgentUserContent({
      prompt: "读这个",
      attachments: [{ url: "u", contentType: "application/octet-stream", fileName: "a.bin", kind: "file" }],
      ...base,
      extractText: async () => null,
    });
    expect(content as string).toContain("未能读取");
  });
});


describe('original media reference identity', () => {
  it('carries video/audio ids for generation reuse without claiming to analyze their content', async () => {
    const extractText = vi.fn(async () => null)
    const content = await buildAgentUserContent({ prompt: 'Use these references', supportsImageInput: true, supportsPdfInput: true, resolveBytes: bytes, extractText, attachments: [
      { assetId: 'asset-video', url: 'nomi-local://v', contentType: 'video/mp4', fileName: 'take.mp4', kind: 'file' },
      { assetId: 'asset-audio', url: 'nomi-local://a', contentType: 'audio/wav', fileName: 'rain.wav', kind: 'file' },
    ] })
    expect(content).toContain('asset-video')
    expect(content).toContain('asset-audio')
    expect(content).toContain('not been watched or listened to')
    expect(extractText).not.toHaveBeenCalled()
  })
  it('retains an executable image identity even for a text-only model', async () => {
    const content = await buildAgentUserContent({ prompt: 'Use this identity', supportsImageInput: false, supportsPdfInput: false, resolveBytes: bytes, extractText: async () => null, attachments: [
      { assetId: 'asset-image', url: 'nomi-local://i', contentType: 'image/png', fileName: 'portrait.png', kind: 'image' },
    ] })
    expect(content).toContain('asset-image')
  })
})

describe('Agent inline reference projection', () => {
  const attachments = [
    { assetId:'image-a', url:'nomi-local://p/a.png', fileName:'a.png', contentType:'image/png', kind:'image' as const },
    { assetId:'video-v', url:'nomi-local://p/v.mp4', fileName:'v.mp4', contentType:'video/mp4', kind:'file' as const },
    { assetId:'image-b', url:'nomi-local://p/b.png', fileName:'b.png', contentType:'image/png', kind:'image' as const },
    { assetId:'audio-s', url:'nomi-local://p/s.wav', fileName:'s.wav', contentType:'audio/wav', kind:'file' as const },
  ]
  it('binds each clause to its original while keeping per-kind numbering and repeated mentions', async () => {
    const raw = `${encodeMention(attachments[2].url)} change background; ${encodeMention(attachments[0].url)} keep the face.\n${encodeMention(attachments[1].url)} animate to ${encodeMention(attachments[3].url)}; keep ${encodeMention(attachments[2].url)}.`
    const prompt = projectAgentPromptForSend(raw,attachments)
    expect(prompt).toBe('@image2 change background; @image1 keep the face.\n@video1 animate to @audio1; keep @image2.')
    const content = await buildAgentUserContent({ prompt,attachments,supportsImageInput:true,supportsPdfInput:false,resolveBytes:bytes,extractText:async()=>null })
    const text = (content as {type:string;text:string}[])[0].text
    const manifest = JSON.parse(text.split('[Selected original media references]\n')[1].split('\n')[0])
    expect(manifest.map((item:{reference:string;assetId:string})=>[item.reference,item.assetId])).toEqual([
      ['@image1','image-a'],['@video1','video-v'],['@image2','image-b'],['@audio1','audio-s'],
    ])
    expect((content as {type:string}[]).filter(item=>item.type==='image')).toHaveLength(2)
  })
  const MEDIA_REFERENCE_MATRIX = attachments.flatMap(attachment => [true, false].map(supportsImageInput => ({ attachment, supportsImageInput })))
  it.each(MEDIA_REFERENCE_MATRIX)('keeps $attachment.fileName canonical identity with vision=$supportsImageInput', async ({attachment,supportsImageInput}) => {
    const prompt = projectAgentPromptForSend(encodeMention(attachment.url), [attachment])
    const content = await buildAgentUserContent({ prompt, attachments:[attachment], supportsImageInput, supportsPdfInput:false, resolveBytes:bytes, extractText:async()=>null })
    const text = typeof content === 'string' ? content : (content[0] as {text:string}).text
    const manifest = JSON.parse(text.split('[Selected original media references]\n')[1].split('\n')[0])
    expect(manifest).toHaveLength(1)
    expect(manifest[0]).toMatchObject({assetId:attachment.assetId,name:attachment.fileName,contentType:attachment.contentType})
    if (attachment.kind === 'image' && supportsImageInput) expect((content as {type:string}[]).some(part=>part.type==='image')).toBe(true)
    if (attachment.contentType.startsWith('video/') || attachment.contentType.startsWith('audio/')) expect(text).toContain('have not been watched or listened to')
  })
  it('refuses a pasted marker without a canonical attachment instead of silently dropping it', () => {
    expect(()=>projectAgentPromptForSend(encodeMention('nomi-local://p/missing.png'),attachments)).toThrow('project_agent_attachment_invalid')
    expect(()=>projectAgentPromptForSend(encodeMention(attachments[0].url),[{...attachments[0],assetId:undefined}])).toThrow('project_agent_attachment_invalid')
  })
})
