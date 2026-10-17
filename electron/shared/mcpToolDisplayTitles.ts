// 「AI 助手连接」卡上「刚刚调用了 X」的 X：每个对外工具的展示名（中 / 英）。
//
// 为什么不直接用工具目录里的 title：目录的 title 是线上 tools/list 的一部分（字节由特征测试钉死，
// 且只有一部分工具带英文），给它补英文或改措辞都会动线上；另有几条标题带「价格」「花钱」字样，
// 不该出现在这张卡上。展示名属于这张卡，单独放；新增工具漏了这里，单测（mcpToolDisplayTitles.test.ts）会红，
// 运行时则回退成内部名（不空着、不报错）。
export type McpDisplayLocale = 'zh-CN' | 'en'

const TITLES: Readonly<Record<string, Readonly<Record<McpDisplayLocale, string>>>> = {
  nomi_session_open: { 'zh-CN': '打开项目会话', en: 'Open project session' },
  nomi_read: { 'zh-CN': '读取项目与制作状态', en: 'Read project and production status' },
  nomi_canvas_edit: { 'zh-CN': '编辑画布', en: 'Edit canvas' },
  nomi_asset_import: { 'zh-CN': '导入本机素材', en: 'Import local asset' },
  nomi_operation_plan: { 'zh-CN': '编辑生成草稿', en: 'Edit generation draft' },
  nomi_operation_preview: { 'zh-CN': '预览生成方案', en: 'Preview generation plan' },
  nomi_operation_gate: { 'zh-CN': '确认生成', en: 'Confirm generation' },
  nomi_operation_execute: { 'zh-CN': '执行已确认的生成', en: 'Run confirmed generation' },
  nomi_operation_control: { 'zh-CN': '取消或核对生成任务', en: 'Cancel or check generation' },
  nomi_run_start: { 'zh-CN': '新建制作草稿', en: 'Start production draft' },
  nomi_run_control: { 'zh-CN': '控制制作任务', en: 'Control production run' },
  nomi_artifact_review: { 'zh-CN': '审阅剧本或分镜', en: 'Review script or storyboard' },
  nomi_run_gate: { 'zh-CN': '制作确认', en: 'Production approval' },
  nomi_project_create: { 'zh-CN': '新建项目', en: 'Create project' },
  nomi_canvas_maintenance: { 'zh-CN': '删除或撤销画布节点', en: 'Delete or undo canvas nodes' },
  nomi_document_read: { 'zh-CN': '读取文稿', en: 'Read document' },
  nomi_document_edit: { 'zh-CN': '编辑文稿', en: 'Edit document' },
  nomi_timeline_read: { 'zh-CN': '读取时间轴', en: 'Read timeline' },
  nomi_timeline_edit: { 'zh-CN': '修改时间轴', en: 'Edit timeline' },
  nomi_export_job: { 'zh-CN': '查看导出', en: 'Check export' },
  nomi_media_query: { 'zh-CN': '查询媒体', en: 'Query media' },
  nomi_model_setup: { 'zh-CN': '接入或调整模型', en: 'Set up a model' },
  nomi_try_model: { 'zh-CN': '试跑模型', en: 'Try a model' },
  nomi_remove_provider: { 'zh-CN': '删除模型连接', en: 'Remove model connection' },
}

export const MCP_TOOL_DISPLAY_TOOL_NAMES: readonly string[] = Object.keys(TITLES)

/** 展示名；没登记的工具回退成内部名。 */
export function mcpToolDisplayTitle(tool: string, locale: McpDisplayLocale): string {
  return TITLES[tool]?.[locale] ?? tool
}
