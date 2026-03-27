# Advanced Copy (Hiruko Edition) 👁️

[![Version](https://img.shields.io/badge/version-1.3.2-red.svg)](https://github.com/qinlinglong/advanced-copy)

**Advanced Copy** 现已觉醒为 **Hiruko (蛭子)** 究极形态。
基于《夏日重现》古神权能，旨在通过高效的”观测”与”重现”，破解繁琐的编码与诊断工作。在 Hiruko 的注视下，所有的代码逻辑都将化为确定的”真实”。

> **v1.3.2 导航功能增强** 🚀 - Navigate to Controller 升级：支持弹窗输入、URL 自动解析、缓存索引加速、文件变化自动更新。

---

## ⌨️ 快捷键矩阵 (Keybindings) - 快速施放权能

在 Hiruko 的注视下，效率即是正义。你可以通过以下组合键（macOS 为 `Cmd`）直接施放权能：

### 核心快捷键
| 权能 (Action) | Windows / Linux | macOS | 效果 (Effect) |
| :--- | :--- | :--- | :--- |
| **复制为 SQL** | `Ctrl + Alt + Q` | `Cmd + Alt + Q` | 瞬发：将实体转化为 Snake Case SQL |
| **复制为 JSON** | `Ctrl + Alt + J` | `Cmd + Alt + J` | 瞬发：将选区或类转化为 Mock JSON |
| **复制 REST 路径** | `Ctrl + Alt + A` | `Cmd + Alt + A` | 瞬发：捕捉接口完整映射路径 |
| **复制引用路径** | `Ctrl + Alt + R` | `Cmd + Alt + R` | 瞬发：提取 Java 全限定路径 |
| **复制 Arthas Vmtool** | `Ctrl + Alt + 1` | `Cmd + Alt + 1` | 瞬发：生成 vmtool 诊断命令 |
| **复制 Arthas TT** | `Ctrl + Alt + 2` | `Cmd + Alt + 2` | 瞬发：生成 tt 记录命令 |
| **📚 Arthas 命令库** | `Ctrl + Alt + 3` | `Cmd + Alt + 3` | **⭐ 新增**：快速访问 59 个 Arthas 命令 |
| **Navigate to Controller** | `Ctrl + Alt + N` | `Cmd + Alt + N` | **⭐ v1.3.2 增强**：弹窗输入 REST 路径或 URL，支持自动 URL 解析、缓存索引加速、文件变化自动更新 |
| **智能粘贴器** | `Ctrl + Shift + V` | `Cmd + Shift + V` | 瞬发：净化并粘贴为 Java 字符串 |
| **复制纯文本** | `Ctrl + Shift + C` | `Cmd + Shift + C` | 瞬发：剥离转义字符，净化为原始内容 |

---

## ✨ 核心权能 (Divine Authorities)

### 1. 🔥 性能境界突破 (Performance Transcendence) - **v1.2.0 新祭坛**
**观测加速密仪**：通过预编译、多层缓存与异步化三重古老遗物，Hiruko 的观测速度迎来 **5-100 倍** 的因果跃升。
- **预编译正则祭坛** ⚡：消除重复编译，正则执行效能提升 **~50%**
- **多维缓存映射** 🔮：文档级符号缓存 + 字段类型缓存，快速连续操作减少 API 调用 **~80%**
- **高效集合结构** 📊：用 `Set` 数据结构替代数组检查，符号类型判断从 O(n) → O(1)，性能突破 **~100x**
- **非阻塞异步觉醒** ✨：版本检查、符号解析全面异步化，主线程永无阻塞，激活速度无感知
- **代码去重净化** 🧹：消除 44 行重复代码，统一工具函数库，可维护性提升

### 2. 📚 Arthas 神兵库 (Arthas Command Library) - **v1.3.0 新增**
**诊断权能扩展至 59 个**：从 15 个命令扩展到 59 个，覆盖方法监控、类检查、全局监控的所有场景。
- **方法相关** (22 个)：watch、trace、stack、monitor、sm、tt、ognl、getstatic 等完整工作流
- **类相关** (13 个)：jad、sc、classloader、dump、redefine、mbean 等类加载诊断
- **全局命令** (24 个)：sysprop、thread、jvm、dashboard、heapdump、histogram、vmtool、vmoption、perfcounter、profiler 等

使用 `Cmd+Alt+3` (Mac) 或 `Ctrl+Alt+3` (Windows/Linux) 快速打开命令库！

### 3. 📊 复制为 SQL (Copy as SQL Select) - **v1.3.0 字段识别完美重铸**
**1.3.0 字段识别优化 & 1.2.0 性能重铸 & 1.1.4 觉醒权能**：将 Java 实体类直接投影为数据库祭坛的查询供物。
- **自动转译**：智能将驼峰命名（CamelCase）解析为下划线命名（snake_case）。
- **表名清洗**：自动识别并清洗 `DTO/Entity/VO/POJO/Bean` 后缀，还原真实的数据库表名。
- **基础类型过滤**：精准观测，自动剔除 `List`、`Map` 等非基础数据库字段，仅保留有效的”数据维度”。
- **字段识别完美重铸**：即使类中仅包含复杂类型字段，也能正确识别或使用通配符，永不误用 `SELECT *`。

### 4. 📋 复制为 JSON (Copy as JSON) - **数据镜像**
**1.2.0 性能优化 & 1.1.4 权能飞跃**：支持**基于选区的局部镜像重现**，并新增统一的类型判断系统。
- **精准映射**：修复数值类型识别偏移，实现 `Integer`、`BigDecimal`、`Long` 等与数字 `0` 的因果对齐。
- **选区重现**：选中部分字段即生成局部 JSON，选中类名即生成全量 JSON 镜像。
- **动态时间戳** ⏰：Mock 日期/时间字段时，自动使用当前系统时间（而非固定时间），实时同步观测时刻。
- **类型缓存加速**：字段类型解析结果缓存，重复操作性能提升 **~70%**

### 5. 🛠️ REST 路径观测 (REST Path) - **接口完整映射**
**1.1.4 新瞳觉醒**：支持 Spring MVC (`@RequestMapping` 等) 全注解识别与路径自动拼接。
- **完整路径拼接**：自动融合 Controller 与 Method 层的 Mapping 路径
- **多注解支持**：支持 @RequestMapping、@GetMapping、@PostMapping 等全系列注解

---

## 🛠 使用方法 (Usage)

在代码编辑器中点击 **鼠标右键**，唤醒 **Advanced Copy** 祭坛：

| 功能 | 标识 | 说明 |
| :--- | :--- | :--- |
| **Copy Reference** | `$(file)` | **[1.0.0]** 核心功能：提取 Java 全限定路径（包名+类名+方法名） |
| **Copy REST Full Path**| `$(link)` | **[1.1.4]** 自动融合 Controller 与 Method 层的 Mapping 路径 |
| **Copy as SQL Select** | `$(database)` | **[1.3.0]** 完美识别字段，支持下划线转译与表名清洗，修复字段遗漏问题 |
| **Copy as JSON** | `$(beaker)` | **[1.1.4]** 选区智能解析，修复数值类型映射精度 |
| **Copy Arthas Vmtool** | `$(zap)` | **[1.2.0]** 穿透内存的诊断神谕，智能自动识别参数类型并拼接，中文参数自动转 Unicode 编码确保跨域安全执行 |
| **Copy Arthas TimeTunnel** | `$(history)` | **[1.1.4]** 生成方法执行记录命令，实现生产现场回溯 |
| **Copy More Arthas Commands** | `$(zap)` | **[1.3.0]** 快速访问 59 个 Arthas 诊断命令库 |
| **Navigate to Controller** | `$(arrow-right)` | **[1.3.2]** 弹窗输入 REST 路径或完整 URL，自动提取 path、快速缓存索引、文件变化自动更新 |
| **Copy Pure Content** | `$(copy)` | **[1.0.1]** 剥离转义字符，净化为原始 JSON/文本 |
| **Paste as Java String** | `$(paste)` | **[1.0.1]** 净化并粘贴为 Java 字符串，自动转义特殊字符 |

---

## 📝 轮回记录 (Changelog)

- **v1.3.2 (导航功能增强)** 🚀 [Latest]
  - **输入方式优化**：Navigate to Controller 从剪贴板读取改为弹窗输入，支持直接输入 REST 路径或粘贴完整 URL
  - **URL 自动解析**：支持识别完整 URL（如 `http://api.example.com:8080/api/user/list`），自动提取 path 部分（`/api/user/list`），自动去除 query 和 hash
  - **缓存索引加速**：首次使用时构建 Controller REST 路径索引，后续搜索从 ~3-5 秒加速到 ~10ms（**300-500x 性能提升**）
  - **文件变化自动更新**：监听工作区文件变化（新增、修改、删除），自动标记缓存为陈旧，下次搜索重新构建索引
  - **搜索进度显示**：构建索引时显示实时进度，提示已扫描文件数和耗时，增强用户体验

- **v1.3.0 (Arthas 神兵库觉醒)** 🚀
  - **Arthas 命令库扩展**：从 15 个扩展到 59 个命令，覆盖方法监控、类检查、全局监控的完整场景
  - **SQL 字段识别完美重铸**：修复类名上复制 SQL 时的字段识别问题，即使仅包含复杂类型也能正确处理
  - **命令参数全面修正**：修复 watch (-x 5→4)、trace (-l→-n)、monitor、sm、stack 等 5 处参数错误
  - **新增 Arthas 快捷键**：`Cmd+Alt+3` 快速访问完整命令库，包含 tt、profiler、vmoption 等高级诊断工具
  - **🔗 导航功能新增**：`Navigate to Controller` - 粘贴 REST 路径，自动查找并打开对应的 Controller，支持精确和前缀匹配
  - **文档升级**：快捷键信息前置，新增命令库完整说明，便于用户快速查阅

- **v1.2.0 (Hiruko Performance Transcendence)** 🚀
  - **性能境界突破：预编译祭坛**：全面引入预编译正则表达式常量库，消除重复编译成本，正则执行效能提升 **~50%**。
  - **因果缓存映射：双层缓存**：新增符号级缓存（symbolCache）与字段类型缓存（fieldTypeCache），快速连续操作减少 API 调用 **~80%**，类型查询性能飙升 **~70%**。
  - **高效集合进化：Set 数据结构**：用 `Set` 替代数组进行符号类型判断，将查询复杂度从 O(n) 降至 O(1)，性能突破 **~100x**。
  - **非阻塞异步赋能**：版本检查、符号解析全面 Promise 化，主线程永无阻塞，插件激活速度感知为零。
  - **工具函数统一**：提取 12 个高频工具函数库（collectSymbols、escapeJavaString、unescapeJavaString 等），消除 44 行重复代码，可维护性飞跃。
  - **类型分类系统**：引入统一的 `TYPE_CATEGORIES` 分类体系，所有数值、字符串、日期等类型判断逻辑归一，代码一致性达成。
  - **JSON 动态时间戳** ⏰：Mock JSON 中的日期/时间字段时，自动使用当前系统时间而非固定时间，实时反映观测时刻。
  - **Vmtool 智能参数拼接** 🎯：自动识别方法参数类型，智能构造参数 JSON；若参数中含有中文字符，自动转为 Unicode 转义序列（`\uXXXX` 格式），确保生成的命令在任何 Arthas 环境都可安全执行。

- **v1.1.4 (Hiruko Edition)** 👁️
  - **因果锁定：快捷键矩阵**：全量支持 `Ctrl+Alt` (Win) / `Cmd+Alt` (Mac) 瞬发快捷键，释放右键祭坛压力。
  - **因果重构：复制 SQL**：新增 `Copy SQL Select` 功能，支持自动表名清洗（DTO/Entity）与命名转译（CamelCase -> snake_case）。
  - **数据建模增强：复制 JSON**：支持类与选区字段精准解析，修复 `BigDecimal`、`Long`、`Integer` 等数值映射至 `0` 的精度偏移。
  - **因果修正：粘贴增强**：智能粘贴现在支持自动剥离 SQL 场景下的首尾括号，并增强了对嵌套转义 JSON 的识别。

  - **新瞳觉醒：REST 观测**：新增 `REST Path` 复制，支持 Spring MVC (`@RequestMapping` 等) 全注解识别与路径自动拼接。
  - **时空隧道：TimeTunnel**：新增 `TimeTunnel Tt` 命令生成，一键捕捉方法执行现场入参与出参。

- **v1.1.2**
  - **引用路径优化**：重构 `Copy Reference` 解析引擎，提升在复杂内部类及多层包名嵌套下的路径提取精度。
  - **激活逻辑优化**：引入 `onStartupFinished` 事件，确保插件在 VS Code 启动后平滑开启版本观测。

- **v1.1.1**
  - **形态定名**：正式定名为 **Hiruko (蛭子)** 形态。
  - **深度适配**：针对 Arthas `vmtool` 复杂参数序列化语法进行深度调优，支持 FastJSON 强制反序列化构造。

- **v1.1.0**
  - **重大更新：诊断神技**：首次集成 Arthas `vmtool` 智能命令生成，支持从内存中穿透并获取实时对象实例。
  - **因果修复**：修复了在 Windows PowerShell 环境下，更新脚本路径含有空格导致执行异常的问题。

- **v1.0.1**
  - **激活增强**：新增 `onLanguage:java` 延迟加载策略，优化插件对系统资源的占用。
  - **反馈增强**：引入 `vscode.window.showInformationMessage` 交互，提供更直观的复制成功提示。

- **v1.0.0 (The Origin)** 🌱
  - **权能诞生**：核心 `Copy Reference` 功能上线，支持提取包名+类名+方法名的基本路径。
  - **版本观测系统**：内置远程版本检测逻辑，实现通过内网 OSS 自动下发 VSIX 更新的能力。
  - **纯净粘贴**：基础版 `Paste as Java String` 上线，解决初级字符串拼接转义问题。

---

**Produced by qinlinglong** *”观测已定，逻辑重现。在 Hiruko 的注视下，代码的影子里没有秘密。”*