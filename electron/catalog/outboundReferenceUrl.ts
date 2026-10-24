import { desktopT } from "../desktopStrings";

/** Wire keys whose values are reference media URLs, across curated mappings and custom calls. */
const REFERENCE_MEDIA_KEYS = new Set([
  "image", "images", "image_url", "image_urls", "image_input", "input_urls",
  "first_frame_image", "last_frame_image", "first_frame_url", "last_frame_url", "start_image_url", "end_image_url",
  "video", "videos", "video_url", "video_urls", "audio", "audios", "audio_url", "audio_urls",
  "reference_image", "reference_images", "reference_image_url", "reference_image_urls",
  "reference_video", "reference_videos", "reference_video_url", "reference_video_urls",
  "reference_audio", "reference_audios", "reference_audio_url", "reference_audio_urls", "voice_reference_audio_url",
  "element_input_urls", "image_with_roles", "imageurl", "source_video_url", "promptimage", "legacy_image", "video_list", "json_edit_image", "json_edit_images", "chat_image_parts",
]);

function normalizedKey(key: string): string { return key.trim().toLowerCase(); }
export function isOutboundReferenceMediaKey(key: string): boolean { return REFERENCE_MEDIA_KEYS.has(normalizedKey(key)); }
function isOpaqueExistingTransport(value: string): boolean { return /^(?:data:|nomi-local:)/i.test(value); }
function isAbsoluteUrl(value: string): boolean { return /^[a-z][a-z\d+.-]*:\/\//i.test(value); }

/** Serialize one reference URL with the platform WHATWG URL parser. */
export function normalizeOutboundReferenceUrl(value: string, field = "reference media"): string {
  if (isOpaqueExistingTransport(value) || !isAbsoluteUrl(value)) return value;
  try {
    const serialized = new URL(value).href;
    if ([...serialized].some((char) => char <= " " || char === "\u007f")) throw new TypeError("serialized URL contains a control character");
    return serialized;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw Object.assign(new Error(desktopT("outbound.referenceUrlInvalid", { field, detail })), { cause: error });
  }
}

function normalizeReferenceValue(value: unknown, field: string): unknown {
  if (typeof value === "string") return normalizeOutboundReferenceUrl(value, field);
  if (Array.isArray(value)) return value.map((item, index) => normalizeReferenceValue(item, `${field}[${index}]`));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      if (normalizedKey(key) === "url" && typeof child === "string") out[key] = normalizeOutboundReferenceUrl(child, `${field}.url`);
      else out[key] = normalizeReferenceValue(child, `${field}.${key}`);
    }
    return out;
  }
  return value;
}

/** Normalize all known reference-media shapes while leaving prompts and other URLs untouched. */
export function normalizeOutboundReferenceMediaUrls<T>(value: T, path = "request"): T {
  if (Array.isArray(value)) return value.map((item, index) => normalizeOutboundReferenceMediaUrls(item, `${path}[${index}]`)) as T;
  if (!value || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const field = `${path}.${key}`;
    out[key] = isOutboundReferenceMediaKey(key) ? normalizeReferenceValue(child, field) : normalizeOutboundReferenceMediaUrls(child, field);
  }
  return out as T;
}

/** Normalize URL-valued text fields in a multipart form (file bytes are kept as-is). */
export function normalizeOutboundReferenceFormData(form: FormData): FormData {
  const out = new FormData();
  for (const [key, value] of form.entries()) {
    if (typeof value !== "string" || !isOutboundReferenceMediaKey(key)) {
      out.append(key, value);
      continue;
    }
    const trimmed = value.trim();
    if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
      try {
        const parsed = JSON.parse(trimmed);
        const normalized = normalizeOutboundReferenceMediaUrls({ [key]: parsed }, `multipart.${key}`) as Record<string, unknown>;
        out.append(key, JSON.stringify(normalized[key]));
        continue;
      } catch {
        // Treat a non-JSON text field as a single URL below; the URL helper supplies the honest error.
      }
    }
    out.append(key, normalizeOutboundReferenceUrl(value, `multipart.${key}`));
  }
  return out;
}
