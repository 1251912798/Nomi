// 参考图错发热修的真付费样本判定（纯函数，不起 App、不花钱就能单测）。
//
// 输入是走查网络闸的账本条目（scripts/walkthrough-network-guard.cjs 在 NOMI_WALK_NET_BODIES=1 时写的
// `allowed-request` / `allowed-response`），判 App 真正发往供应商的那一次视频创建请求里带了哪些图。
//
// 两条要点（V-refleak 第 1 轮的条件）：
//   · **按地址去重**：APIMart 首尾帧的请求体里 image_urls 和 image_with_roles 各带一遍首帧、尾帧，
//     直接数会数成 4 张；按去掉查询串后的地址去重，再断言集合恰好是首帧、尾帧两张（对回本地文件名）。
//   · **残留参考的任何形态都不许出现**：文件名、本地地址、托管上传后的公网地址（地址哈希），在请求体里和托管上传里都不许有。
import crypto from 'node:crypto'

/** URL 去掉查询串（签名参数）后的样子；闸已经把查询串换成 `?<redacted>`。 */
export function bareUrl(url) {
  return String(url).split('?')[0].split('#')[0]
}

export function shortHash(text) {
  return crypto.createHash('sha256').update(String(text)).digest('hex').slice(0, 12)
}

function urlsIn(value, out = []) {
  if (typeof value === 'string') { if (/^(https?:|data:|nomi-local:)/i.test(value)) out.push(value) }
  else if (Array.isArray(value)) value.forEach((item) => urlsIn(item, out))
  else if (value && typeof value === 'object') Object.values(value).forEach((item) => urlsIn(item, out))
  return out
}

const MEDIA_NOT_IMAGE = /\.(mp4|mov|webm|mp3|wav|m4a)$/i

/**
 * @param {Array<Record<string, any>>} entries 闸的账本条目
 * @param {{ host: string, firstFile: string, lastFile: string, referenceFiles: string[], localUrlOf?: (file: string) => string }} scene
 * @returns {{ problems: string[], summary: Record<string, unknown> }}
 */
export function judgeReferenceWire(entries, { host, firstFile, lastFile, referenceFiles, localUrlOf }) {
  const problems = []
  const expected = [firstFile, lastFile].sort()
  const creates = entries.filter((entry) => entry.kind === 'allowed-request' && entry.host === host && entry.method === 'POST' && /\/videos\/generations$/.test(new URL(entry.url).pathname))
  if (creates.length !== 1) problems.push(`发往 ${host} 的视频创建请求有 ${creates.length} 次（应恰好 1 次）`)
  const bodyText = String(creates[0]?.body?.text ?? '')
  let body = null
  try { body = bodyText ? JSON.parse(bodyText) : null } catch { problems.push('创建请求的请求体不是 JSON（或被截断）') }
  if (creates[0]?.body?.truncated) problems.push('创建请求的请求体超过记账上限被截断，图片地址可能没读全')

  // 托管上传：multipart 记了文件名；同一个 seq 的响应里带着公网地址。
  const uploads = entries.filter((entry) => entry.kind === 'allowed-request' && Array.isArray(entry.body?.form))
    .flatMap((entry) => entry.body.form.filter((part) => part.fileName).map((part) => ({ seq: entry.seq, fileName: String(part.fileName) })))
  const fileByRemote = new Map()
  for (const upload of uploads) {
    const response = entries.find((entry) => entry.kind === 'allowed-response' && entry.seq === upload.seq)
    for (const url of String(response?.text ?? '').match(/https?:\/\/[^\s"'\\]+/g) ?? []) fileByRemote.set(bareUrl(url), upload.fileName)
  }
  for (const file of [...referenceFiles, firstFile, lastFile]) if (localUrlOf) fileByRemote.set(bareUrl(localUrlOf(file)), file)

  // 去重：同一张图在 image_urls 和 image_with_roles 里各出现一次，算一张。
  const rawImageUrls = body ? urlsIn(body).filter((url) => !MEDIA_NOT_IMAGE.test(bareUrl(url))) : []
  const uniqueImageUrls = [...new Set(rawImageUrls.map(bareUrl))]
  const sent = uniqueImageUrls.map((url) => ({ file: fileByRemote.get(url) ?? null, urlSha256: shortHash(url) }))
  const sentFiles = sent.map((entry) => entry.file)
  if (sentFiles.some((file) => file === null)) problems.push(`请求体里有 ${sentFiles.filter((file) => file === null).length} 张图对不回本地文件名（托管上传没记到，或换了别的上传形状）——证明不了只发了首帧、尾帧`)
  if (JSON.stringify([...sentFiles].sort()) !== JSON.stringify(expected)) problems.push(`请求体里的图（去重后）是 ${sentFiles.map((file) => file ?? '?').join('、') || '（没有）'}，应恰好是 ${expected.join('、')}`)

  // 残留参考的任何形态：文件名、本地地址、托管后的公网地址（报告里只露地址哈希）。
  const referenceForms = new Set(referenceFiles)
  for (const file of referenceFiles) if (localUrlOf) referenceForms.add(localUrlOf(file))
  const referenceRemote = [...fileByRemote].filter(([, file]) => referenceFiles.includes(file)).map(([url]) => url)
  for (const url of referenceRemote) referenceForms.add(url)
  const inBody = [...referenceForms].filter((form) => bodyText.includes(form))
  if (inBody.length) problems.push(`残留参考出现在请求体里：${inBody.map((form) => (form.startsWith('http') ? shortHash(form) : form)).join('、')}`)
  const uploadedFiles = [...new Set(uploads.map((upload) => upload.fileName))].sort()
  const leakedUploads = uploadedFiles.filter((file) => referenceFiles.includes(file))
  if (leakedUploads.length) problems.push(`界面上没在用的参考图被托管上传了：${leakedUploads.join('、')}`)
  if (uploadedFiles.some((file) => !expected.includes(file))) problems.push(`托管上传的文件是 ${uploadedFiles.join('、')}（应只有 ${expected.join('、')}）`)

  return {
    problems,
    summary: {
      createRequests: creates.length,
      endpoint: creates[0] ? `${new URL(creates[0].url).host}${new URL(creates[0].url).pathname}` : null,
      imageUrlOccurrences: rawImageUrls.length,
      imagesInBody: sent,
      hostedUploads: uploadedFiles,
      problems,
    },
  }
}
