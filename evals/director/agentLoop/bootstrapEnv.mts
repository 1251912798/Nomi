// 必须是 run.mts 的第一个 import：3D-BOX 开关在进程首个导入引导模块时定死（electron/shared/featureFlags/director3dbox.ts），
// 评测要量的是开关开的那张工具面，所以先把开发态环境变量放好，再让下一行 import 引导模块。
process.env.NOMI_DESKTOP_DEV = '1'
process.env.NOMI_DIRECTOR_3DBOX = '1'
export {}
