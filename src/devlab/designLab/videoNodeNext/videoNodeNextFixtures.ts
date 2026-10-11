// 样张媒体唯一入口：仓库真实视频及从该视频抽出的缩略图；只渲染，不持久化。
export const VIDEO = new URL('../../../../tests/ux/fixtures/real-shot-640x360.mp4', import.meta.url).href
export const THUMBS = [
  new URL('./assets/clip-01.jpg', import.meta.url).href,
  new URL('./assets/clip-02.jpg', import.meta.url).href,
  new URL('./assets/clip-03.jpg', import.meta.url).href,
  new URL('./assets/clip-04.jpg', import.meta.url).href,
  new URL('./assets/clip-05.jpg', import.meta.url).href,
  new URL('./assets/clip-06.jpg', import.meta.url).href,
  new URL('./assets/clip-07.jpg', import.meta.url).href,
  new URL('./assets/clip-08.jpg', import.meta.url).href,
]
