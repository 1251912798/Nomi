# DC23 通知身份合流

当前基线 c6fe8c608 已包含通知政策；原审计所述随机身份不再存在。本任务不另造生产实现。

`src/ui/toastPolicy.test.ts` 使用真实 Mantine store，覆盖五次同身份同原因只保留一条、最新回调、队列去重、不同对象隔离、更换原因清计数、原地结果撤回全局通知。与 toast.test.ts 合计及其他本批投影回归见 focused-presentation.log（25 tests passed）。

同文案跨任务不能靠字符串合并：现役 contextual notify 必填 identity/reason；旧纯文字入口的兼容规则不作为新业务入口。供应商切换沿 providerSwitchToastId，B4 只修 display name，不另起生命周期。
