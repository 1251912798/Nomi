# 方向检查：导演台 model/ 目录——2026-10-24 走查露出的 ② ① ④

日期：2026-10-24。线：I-director-fixes（实现）。性质：fix。
`node scripts/fix-churn.mjs` 对本次要改的三个 model/ 文件都报**目录口径**命中，文件本身没命中。
目录 `src/workbench/generationCanvas/nodes/director/model/` 近 14 天已有 4 个 fix，只涉及 1 个文件，按同一概念算。

| 单位 | 近 14 天 | 本次碰不碰 |
|---|---|---|
| `model/directorPreviewState.ts`（4 个 fix 全在这里） | 4 | **不碰** |
| `model/directorStore.ts` | 文件本身 0；目录命中 | 碰：② sceneConfig 写口自带撤销步 |
| `model/defaultCharacter.ts` | 文件本身 0；目录命中 | 碰：① 加人 / 群众写入口只存动作正名 |
| `model/cameraPresets.ts` | 文件本身 0；目录命中 | 碰：④ 机位预设的参照系 |

## 0. 一句话根因

目录热，是因为预演挂接（`directorPreviewState.ts`）这一个概念 14 天修了 4 刀，和本次三条不是同一类。
本次三条各有类根因，形状相同：**一份事实的口径没在写入边界定死，留给下游各记各的。**
- ②：撤销步留给每个调用方记得先存快照。
- ①：动作 id 是不是正名，留给读取方去认别名。
- ④：「从哪边看主体」直接拿了主体的整份旋转。

三刀都是把口径收回写入边界、替掉旧做法，不在下游加认特例的分支。

## 1. 归类表：bug → 直接原因 → 类

| 提交 / bug | 直接原因 | 类 |
|---|---|---|
| `aafea7949` 过期预演也挡花钱闸 | 过期预演没进挡住原因词表 | 预演挂接时效（directorPreviewState） |
| `e65ffa7d4` V-3dbox 三项 | 超长按当前工程判、花钱守卫可达性 | 同上 |
| `66e1fc74b` 预演参考挂接按当前现状判 | 挂接按旧现状判、编号不随实际参考顺序 | 同上 |
| `04ccb3138` 换模型后预演自动重挂 | 换模型后挂接没重判 | 同上 |
| 本次 ② 「视图 ▾」开关 ⌘Z 连带撤掉上一步 | `patchSceneConfig` 是裸写口；10-04 `1fcc5bbcd` 把开关搬进 ViewMenu 时丢了先存快照 | 撤销步归调用方记得 |
| 本次 ① 放下的群众站成 T 字 | 默认动作 `standing_idle` 是别名，原样写进 `posePreset`；姿态采样只按正名查，查不到退回绑定姿态 | 动作 id 口径没在写入口定 |
| 本次 ④ 泼溅「正面特写」机位在地下 | 预设套主体整份旋转，泼溅按源轴约定绕 X 翻 180° | 机位参照系口径错 |

## 2. 为什么这一类会一直出现

**② 撤销。** store 的写口分两种：
- 自带撤销步的：`setExportRatio`、`reorderTimelineTracks`，都是 `withHistory(commitProject)`。
- 裸写的：`patchSceneConfig`、`patchPanoramaConfig`、`updateObject`，要调用方先 `saveState`。

裸写口对不对，取决于每个调用方都记得先存快照，搬一次家就丢（`1fcc5bbcd`）。

换法：sceneConfig 只剩一扇门，门自己记撤销步，调用方不用记得。连续手势（滑条、色板拖动）沿用字段原语既有的约定——手势开头调 `onChangeStart` 存快照。门认这张快照作锚，后面同一组键的每一帧都并进这一步。别的写入一插进来，手势就结束；离散点击永远单独成一步。

这里加了一个判断：在不在同一组键的手势里。它不是给某个调用方开的特例，是这扇门的撤销语义本身。
如果协调判它算「新增分支」，退路只有两条：
- ViewMenu 四项各包一层 `withHistory`。这是补，正是反例。
- 检查器滑条改调新的手势写口。要动 `SceneLayerInspector.tsx`，超出 8 个产品文件的停点。

**① 别名。** 别名表一份三用：AI / 自然语言词、旧 id 读档、中文。`findActionEntry` 和 `resolveActionAlias` 都认别名，所以「校验过」不等于「存的是正名」。写入口原样写调用方给的 id，就把别名放进了工程。

换法：`posePreset` 只存正名。加人 / 群众共用的写入口 `defaultCharacterInput` 解析一次，认不出就抛，结构上写不进去（door-map：2 扇写门都经它）。默认常量直接取库里的正名。采样层不加认别名的分支（两边只做一边）。

**④ 参照系。** 主体的旋转里混着源轴约定（泼溅绕 X 翻 180°）、俯仰和横滚，这些都和「机位从哪边看」无关。

换法：参照系 = 主体位置 + 水平朝向 + 各轴尺度大小（儿童 / 巨人体形是缩放做的，要留）。
水平朝向从主体的世界框架读：
- 读右轴在地面上的投影。直立主体时，它就是偏航。
- 躺倒的主体前轴竖直，右轴仍在地面上，照样读得出。
- 右轴竖直（横滚 ±90°）时，退回读前轴。

不读欧拉 y 那个数：精修「＋ → 机位」传的是世界矩阵分解出来的欧拉，|偏航| > 90° 时会分解成 (180, 180−ψ, 180)。

**三条体验铁律**：⑩ 不适用（不涉及生成参数）；⑪ 不适用；⑫「点了 = 以为的」三条都落在这里：
- ② 点开关再 ⌘Z，只撤开关：`director-fields` 走查。
- ① 放下群众 = 站立待机：`director-ual-crowd` 走查量手比上臂低。
- ④「正面特写」= 主体正面、地面以上：`cameraPresets.test.ts`。

## 3. 不改结构的话，接下来会冒出什么

| 预测 | 怎么验证 |
|---|---|
| 再有开关或字段搬到别的面板、丢了存快照，又一次连带撤销 | sceneConfig 已无裸写口；`directorSceneTransactions.test.ts` 的 `every sceneConfig key is its own undo step` 逐键钉住 |
| 套姿态入口收到别名同样站 T 字（`applyPosePreset` / `applyPosePresetToGroup` 原样写调用方给的 id；devlab 已在传 `standard_walk`） | `crowd.test.ts` 的 `changing the action on the group…` 现在钉的就是原样存别名——**停下交协调** |
| 已经存过的群众关掉重开仍站 T 字（读档迁移 `migrateCharacterToUal` 对 `rig === 'ual'` 的内置人偶提前 return，不换别名） | 探针：建群众 → `exportProject` → 用它重开 → `posePreset` 仍是 `ual:standing_idle`（输出见报告）——**停下交协调** |
| 「创建特写片段」对组里的角色（群众成员）把本地变换当世界算 | 读 `storeCameraActions.createCloseupForCharacter`：subject 是 `object.position / rotation / scale`（本地）；列为残留，不在本刀 |

## 4. 靶子独立性检查

- 不涉及评测分数。
- 走查断言由走查迁移线写，本线只在 `director-ual-crowd` 加了一条「群众姿势不是绑定姿态」。
- 单测是本线写的，每条都在 `git archive HEAD` 副本里退回修复、证明会红。
- 独立验收由协调另派。

## 5. P0：这些是我们独有的吗

- **撤销**：整树快照撤销是导演台 store 自有的（zustand + immer）。现成的 zustand 撤销中间件（zundo）用 `pause` / `resume` 管手势，思路相同。换成它等于重写整套撤销（50 步快照、`withHistory` 嵌套、滚轮合并），不在一扇写口的修复范围里。本刀没有新增自写通用能力。
- **动作别名**：动作库（UAL 动作清单 + 别名表）是领域本身。
- **机位参照系**：用现有 `vec3` 数学，没有新增自写库。

## 6. 选项对比与推荐

| 选项 | 做什么 | 代价 | 风险 | 推荐 |
|---|---|---|---|---|
| 接入现成方案 | ②：zustand 撤销中间件 zundo 的 pause / resume 管手势 | 重写整个 store 的撤销 | 高 | 不选：本刀只是一扇写口 |
| 换（本次） | ② 写口自带撤销步 + 手势锚；① 写入口解析正名、认不出就抛；④ 参照系换成位置 + 水平朝向 + 尺度 | 3 个 model 文件 | 低：老调用方行为不变（检查器「先存再写」、`withHistory` 包着写都还是一步），单测钉住 | **推荐**（P1 例外：只因目录口径命中、改法是换，协调代批） |
| 补 | ② ViewMenu 四项各补 `saveState`；① 采样层认别名；④ 特判泼溅 | 小 | 下一个调用方 / 入口照样漏 | 不选（反例） |
| 删 | ② 把视图开关挪成纯视图偏好、不进工程 | 改工程数据格式，要迁移旧工程 | 停点 | 不选（协调倾向走历史） |

## 7. 用户要权衡的核心

① 的旧工程那一半：已经存过的群众，读档时要不要把别名改写成正名。
- 改：会改旧工程里的值（格式不变）。
- 不改：旧工程里的群众继续站 T 字，要用户自己重新套一次动作。

## 特征测试清单

- **②**：
  - `directorSceneTransactions.test.ts` 原有的撤销 / 图层 / 片段事务测试不改，全绿。
  - 新增两条修前修后都绿，钉住检查器滑条与组合动作的现状：`a slider drag … is exactly one undo step`、`inside a composed withHistory action the door adds no step of its own`。
- **④**：
  - `cameraPresets.test.ts` 原有 4 条不改（朝 +X 主体的正面特写、无主体、当前视角、14 个预设）。
  - 修前修后都绿：`body-type scale still applies`、`… decomposed as (180, 60, 180) frames like a 120° yaw`。
- **①**：
  - `crowd.test.ts` 原有的分组 / 网格 / 撤销测试不改。
  - `changing the action on the group…` 钉着套姿态入口现在原样存别名，这是停下交协调的那一半。

## 第 2 轮（2026-10-24，协调拍板：① 剩下三处 + 同类残留）

**命中情况**：
- `model/` 目录口径命中：近 14 天 7 个 fix，只涉及 4 个文件。本次要改的 `characterRigMigration.ts`、`storeCharacterActions.ts`、`storeClipActions.ts` 文件本身都是 0。
- `model/compiler/` 是另一个目录，没命中。
- `panels/` 目录口径命中：2 个 fix，只在 1 个文件。本次在 panels/ 只删 `CanvasImagesContext.ts`（死代码），提交按 refactor 走。
- 改法都是换或删：同一提交替掉旧写法，不新增认别名的分支、不加特例。按 P1 例外由协调代批。

### ① 动作 id 只存正名：剩下的门

第 1 轮只收住了加人 / 群众共用的写入口 `defaultCharacterInput`。下面这些门还会把别名写进工程，用 door-map 和静态清单 `ACTION_ID_SITES` 数全：

| 门 | 以前 | 现在 |
|---|---|---|
| 编译器 `actorObject` | 写死 `posePreset: 'standing'`，是别名 | 模块加载时解析一次 `STANDING_POSE_ID`；库里没有站立待机就当场抛 |
| `applyPosePreset` / `applyPosePresetToGroup` | `findActionEntry` 校验后，原样写调用方给的 id | 入口用 `resolveActionAlias` 换成正名；认不出返回 false / 0，不写（和写入口同一口径） |
| `addActionClip` / `updateActionClip` 的 `actionPose`（同一类） | 原样写 | 同上；认不出时 add 返回 null，update 不动、也不进撤销栈 |
| 读档 `migrateCharacterToUal` | 已经是 UAL 的内置人偶和上传角色提前 return，别名不换 | 每个角色的 `posePreset` 和片段 `actionPose` 一律 `resolveActionAlias` |

**认不出的 id 怎么办**：
- 写入口一律拒。
- 读档原样留：它可能是新版本存的动作，删掉就丢数据；采样层查不到照旧退回绑定姿态。

**编译器为什么不走 `defaultCharacterInput`**：
- 那个入口还会写性别配色、modelPath、rig、isSystemModel、modelScale，编译出来的人会换样子。
- 手改覆盖层按逐属性指纹对账，多出这些字段，已有的覆盖会全部失配。
- 编译器也没有性别这个输入。
- 所以只换动作 id，这是最小的「换」。

**指纹不受影响**：
- planOverrides 算指纹前，两边都先过 normalize。
- 编译出来的人没写 rig，旧的读档迁移本来就走内置 Mixamo 那条路，会把 `standing` 换成正名。所以旧工程里存的指纹，本来就是正名的指纹。
- 编译器出口改成正名后，两边归一的结果一样，不会凭空多出一条「手改了姿态」。
- `actionIds.test.ts` 有一条钉住：用旧写法编出来的结果算指纹，和现在的完全相同。

**为什么不做品牌类型（`CanonicalActionId`）**：要改约 37 处测试调用点和 UI 调用方，超出 16 个产品文件的停点。换成四层：
- 入口解析；
- 读边界兜底；
- 类测试：全部别名 × 12 扇门；
- 静态清单：生产代码里写 `posePreset` / `actionPose` 的文件就这 10 个，新增一处就红。

### 删 CanvasImagesContext

- 它唯一的消费方「AI 搭场景」已随 `8876f0c5d` 删除。
- 之后 DirectorNode 仍订阅全画布节点表算图片列表，每次画布写入都跑一遍收集器；DirectorEditor 仍注入这个 Context，但没有人读。
- 同一提交删掉收集器、它的单测、Context 和两处接线。
- 边界主人台账（`scripts/boundary-owners-ledger.json`）记退役。

### 系统哪里没拦住

- **别名**：各写入口自己校验（`findActionEntry` 认别名），没有一道门守「存进去的必须是正名」。现在由类测试和静态清单守。
- **死代码**：仓库没有「导出没人用」的门岗（没有 knip 一类工具）。要不要接一个现成的，交协调定。

### 特征测试（第 2 轮）

- `characterRigMigration.test.ts`：原有测试不改，全绿。
- `crowd.test.ts` 有两条原来钉的是「原样存别名」，也就是这次要修的 bug，期望改成正名：
  - 群组换动作 `standard_walk` → `Walk_Loop`，并加一条「已经是正名再套一次返回 0」；
  - 单人 `running` → `Jog_Fwd_Loop`。
- 其余分组、网格、撤销测试不改。
