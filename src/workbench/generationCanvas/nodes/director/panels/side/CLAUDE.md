# director/panels/side/
> L2 | 父级: ../CLAUDE.md
> 右栏：上半是「场景里有什么」（大纲 / 资产库），下半是属性检查器（inspector/）。
> 成员清单
> SidePanels.tsx: 右栏装配：场景对象 / 资产库 标签页 + 属性检查器，纵向可拖分栏
> SceneObjectsTab.tsx: 大纲：图层（新建/复制/重命名/删除/显隐/激活）+ 实体树（显隐/锁定/删除/重命名/跨图层复制移动/Ctrl·Shift 多选）+ 多选浮条 + 搜索
> AssetsTab.tsx: 资产库：连线引用（LinkedAssetsContext）/ 用户上传（工程 assets：上传 GLB·GLTF·FBX·PLY·SPZ·SPLAT·KSPLAT·SOG·图片·场景 JSON，文件夹增删改、条目移动 / 重命名 / 删除）/ 泼溅场景（上传里的泼溅）/ 预设模型 / 基础灯光 / 基础几何体；双击或「添加」入场景，全景设为天空，场景 JSON 导入为新图层；资产桥落盘，无桌面运行时退回 data / blob URL 并提示临时；目录菜单/拖放共用 assetFolders 防环，搜索展开命中祖先
> 法则: 成员完整·一行一文件·父级链接·技术词前置
> [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
