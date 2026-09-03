# Java Dev Toolkit

[![Version](https://img.shields.io/badge/version-1.1.3-blue.svg)](https://github.com/qinlinglong/java-dev-toolkit)
[![Language](https://img.shields.io/badge/language-English%20%7C%20中文-brightgreen.svg)](#readme-languages)

<div id="readme-languages">

[🇺🇸 English](#english-version) | [🇨🇳 中文](#chinese-version)

</div>

---

<a id="english-version"></a>

# English Version

**Java Dev Toolkit** — Essential tools for Java developers.

A comprehensive VSCode extension designed for Java developers, featuring quick copy, format conversion, REST API navigation, and Arthas diagnostic commands to boost productivity.

## ⌨️ Keyboard Shortcuts Matrix

Right-click to open the menu or use these keyboard shortcuts:

| Feature | Shortcut (Windows/Linux) | Shortcut (macOS) |
| :--- | :--- | :--- |
| **Copy Reference** | `Ctrl+Alt+R` | `Cmd+Alt+R` |
| **Copy REST Full Path** | `Ctrl+Alt+A` | `Cmd+Alt+A` |
| **Navigate to Controller** | `Ctrl+Alt+N` | `Cmd+Alt+N` |
| **Copy as JSON** | `Ctrl+Alt+J` | `Cmd+Alt+J` |
| **Copy as SQL Select** | `Ctrl+Alt+Q` | `Cmd+Alt+Q` |
| **Copy Arthas Vmtool** | `Ctrl+Alt+1` | `Cmd+Alt+1` |
| **Copy Arthas TimeTunnel** | `Ctrl+Alt+2` | `Cmd+Alt+2` |
| **Copy More Arthas Commands** | `Ctrl+Alt+3` | `Cmd+Alt+3` |
| **Copy Pure Content** | `Ctrl+Shift+C` | `Cmd+Shift+C` |
| **Paste as Java String** | `Ctrl+Shift+V` | `Cmd+Shift+V` |

## ✨ Features

### 1️⃣ 📌 Copy Reference
Extract Java fully qualified paths (package + class + method) for quick reference copying.
- **Use Case**: Documentation, logging, code references
- **Shortcut**: `Ctrl+Alt+R` (Windows) / `Cmd+Alt+R` (macOS)

### 2️⃣ 🌐 Copy REST Full Path
Automatically identify and concatenate complete REST API paths. Supports three frameworks:

**Spring MVC Style** ✅
- `@RequestMapping`, `@GetMapping`, `@PostMapping`, `@PutMapping`, `@DeleteMapping`, etc.
- Auto-merge class and method level paths

**JAX-RS Style** ✅
- `@Path` annotations (class and method level)
- Complete path auto-concatenation

**Spring Cloud Feign Style** ✅
- `@FeignClient` + `@RequestMapping` combination
- Auto-identify client paths

**Features**:
- Complete path concatenation: auto-merge Controller and Method paths
- **Shortcut**: `Ctrl+Alt+A` (Windows) / `Cmd+Alt+A` (macOS)

### 3️⃣ 🎯 Navigate to Controller
Input or paste REST path/complete URL to locate corresponding Controller code.

**Key Features**:
- **Smart URL Parsing**: Support full URLs (e.g., `http://api.example.com:8080/api/user/list`), auto-extract path
- **Multi-level Matching**: Exact match → Prefix match → Path suffix match
- **Cache Acceleration**: First search 3-5s, subsequent searches **10ms** (**300-500x improvement**)
- **Auto-sync**: Monitor workspace changes, auto-invalidate stale cache
- **Multi-framework Support**: Spring, JAX-RS, Feign fully compatible
- **Shortcut**: `Ctrl+Alt+N` (Windows) / `Cmd+Alt+N` (macOS)

### 4️⃣ 📦 Copy as JSON
Convert Java classes or selected fields to JSON structures.

**Features**:
- **Auto Type Detection**: Basic types, collections, dates generate appropriate mock values
- **Selection Support**: Convert only selected fields or entire class
- **Precise Type Mapping**: Correct handling of `Integer`, `BigDecimal`, `Long`, etc.
- **Dynamic Timestamps** ⏰: Auto-use current system time for date/time fields
- **Performance Optimization**: Field type caching improves performance ~70%
- **Shortcut**: `Ctrl+Alt+J` (Windows) / `Cmd+Alt+J` (macOS)

### 5️⃣ 📊 Copy as SQL Select
Convert Java entity classes to SQL SELECT statements.

**Features**:
- **Auto Name Translation**: Convert CamelCase to snake_case intelligently
- **Smart Table Name Cleaning**: Auto-identify and clean suffixes, restore real table names
- **Field Filtering**: Auto-exclude `List`, `Map`, `Stream`, `Optional`, etc.
- **Perfect Fallback**: Handle complex type fields correctly
- **Shortcut**: `Ctrl+Alt+Q` (Windows) / `Cmd+Alt+Q` (macOS)

**Example**:
```java
public class UserDTO {
    private String userId;
    private String userName;
    private List<String> roles;  // Auto-excluded
}
```
↓ Converts to ↓
```sql
SELECT user_id, user_name FROM user
```

### 6️⃣ 🔧 Arthas Diagnostic Commands

#### Copy Arthas Vmtool
Generate Arthas vmtool commands for quick memory data inspection and modification.
- **Auto Parameter Detection**: Identify method parameter types automatically
- **Chinese Parameter Support**: Auto-convert to Unicode escapes for cross-environment execution
- **Shortcut**: `Ctrl+Alt+1` (Windows) / `Cmd+Alt+1` (macOS)

#### Copy Arthas TimeTunnel
Generate Arthas tt time tunnel commands for method execution recording and replay.
- **Execution Recording**: Quick method execution record command generation
- **Production Debugging**: Implement production issue root cause analysis
- **Shortcut**: `Ctrl+Alt+2` (Windows) / `Cmd+Alt+2` (macOS)

#### Arthas Command Library (59+ Commands)
Quick access to complete Arthas diagnostic command library including:

**Method Monitoring** (22 commands)
- watch, trace, stack, monitor, sm, tt, ognl, getstatic, invoke, etc.

**Class Inspection** (13 commands)
- jad, sc, classloader, dump, redefine, mbean, search, etc.

**Global Monitoring** (24 commands)
- sysprop, thread, jvm, dashboard, heapdump, histogram, vmtool, vmoption, perfcounter, profiler, etc.

- **Shortcut**: `Ctrl+Alt+3` (Windows) / `Cmd+Alt+3` (macOS)

### 7️⃣ 📄 Copy Pure Content
Extract plain text from strings, automatically removing escape characters.
- **Escape Removal**: Strip `\n`, `\t`, `\\` and other escape characters
- **Format Cleaning**: Restore escaped text to original content
- **Shortcut**: `Ctrl+Shift+C` (Windows) / `Cmd+Shift+C` (macOS)

### 8️⃣ 📌 Paste as Java String
Smart paste as Java string with automatic escape character conversion.
- **Auto Escape**: Automatically escape `"`, `\`, newlines, and other special characters
- **Quick Paste**: One-click paste as standard Java string
- **Shortcut**: `Ctrl+Shift+V` (Windows) / `Cmd+Shift+V` (macOS)

## 🚀 Getting Started

### Step 1: Uninstall Old Version (if installed)
If you previously installed **Advanced Copy for Java**, please uninstall to avoid keyboard shortcut conflicts:
- Search for "Advanced Copy for Java" in VSCode extension marketplace
- Click Uninstall

### Step 2: Install This Toolkit
- Search for "Java Dev Toolkit"
- Click Install

### Step 3: Start Using
- Open a Java file
- **Right-click** at code location and select **Java Dev Toolkit** menu
- Or use keyboard shortcuts above

## 💡 Usage Tips

| Scenario | Recommended Approach |
| :--- | :--- |
| **Daily Development** | Use keyboard shortcuts for fastest access; context menu as fallback |
| **REST API Debugging** | Combine Copy REST Full Path + Navigate to Controller |
| **Database Operations** | Use Copy as SQL Select for quick SQL template generation |
| **Performance Diagnosis** | Use Copy Arthas Commands for quick diagnostic command generation |
| **Code Documentation** | Use Copy Reference for complete reference paths |
| **JSON Processing** | Use Copy as JSON for quick mock data generation |

## 📝 Version History

### v1.1.3 (Maintenance Release) - Latest ⭐

- **Release parity**: regenerated all named plugin packages from the complete Java Dev Toolkit implementation.
- **Packaging cleanup**: VSIX packages contain only the runtime extension files and required documentation.

### v1.1.2 (REST Navigation and Fuzzy Search)

- **Fuzzy REST navigation**: tolerates typos and supports prefix, suffix, CamelCase, abbreviation, and similarity matching.
- **Controller index**: supports Spring MVC, Spring Cloud Feign, and JAX-RS routes with workspace-isolated caching.
- **Live updates**: Java file changes are incrementally reflected without rebuilding the entire index.

### v1.1.0 (SQL Field Filtering Enhancement)
- **Complex Type Filtering**: Added Stream, Optional, Supplier, Consumer, Function, Predicate, Comparator filtering
- **Regex Improvement**: Enhanced field declaration regex to support annotations, volatile modifier, nested generics
- **Code Quality**: Extracted common logic into reusable functions (isComplexType, getFieldRegex)
- **Performance**: Improved SQL generation performance through optimized regex patterns

### v1.0.2 (SQL Field Recognition Fix)
- **Field Identification**: Changed to blacklist mechanism, exclude only List/Map/Set/Collection/Array
- **Feature Alignment**: Copy SQL now fully aligned with Copy JSON field identification logic
- **Bug Fix**: Fixed field unrecognition issue when copying SQL from class name
- **UX Improvement**: Copy SQL on class name now correctly shows all fields, not SELECT *

### v1.0.1 (Menu Name Unification)
- **Menu Consistency**: Unified right-click menu name from "JavaDev Copilot" to "Java Dev Toolkit"
- **Brand Alignment**: All UI elements, documentation, and menu names fully aligned
- **Quick Start Optimization**: Simplified upgrade instructions

### v1.0.0 (Brand Rebranding)
- **Brand Upgrade**: Renamed from "JavaDev Copilot" to "Java Dev Toolkit"
- **Clear Positioning**: Emphasize toolkit collection, fully match current and future feature plans
- **Complete Features**: 10 commands + complete keyboard configuration + single-level menu design
- **Quality Assurance**: Fixed SQL field filtering, menu structure optimization, and other issues

## 📦 Project Info

- **Publisher**: qinlinglong
- **Repository**: https://github.com/qinlinglong/java-dev-toolkit
- **License**: MIT
- **Minimum VSCode Version**: 1.75.0

## 🎯 Core Advantages

✨ **Optimized for Java Development** - 10+ carefully selected features covering daily development scenarios

⚡ **Lightning Fast** - Cache acceleration, subsequent searches 10ms response, 300-500x performance improvement

🔄 **Multi-Framework Support** - Spring, JAX-RS, Feign fully compatible

🎨 **Intelligent Conversion** - JSON/SQL auto-type detection, CamelCase/snake_case auto-translation

🚀 **Diagnostic Powerhouse** - 59+ Arthas commands library for quick production issue diagnosis

---

<a id="chinese-version"></a>

# 中文版本

**Java Dev Toolkit** — Java 开发者的必备工具集。

一款为 Java 开发者精心打造的 VSCode 插件，集快速复制、格式转换、REST 路径导航、Arthas 诊断命令生成于一身，全面提升开发效率。

## ⌨️ 快捷键矩阵

右键打开菜单或使用以下快捷键快速操作：

| 功能 | Windows/Linux | macOS |
| :--- | :--- | :--- |
| **复制引用路径** | `Ctrl+Alt+R` | `Cmd+Alt+R` |
| **复制 REST 路径** | `Ctrl+Alt+A` | `Cmd+Alt+A` |
| **导航到 Controller** | `Ctrl+Alt+N` | `Cmd+Alt+N` |
| **复制为 JSON** | `Ctrl+Alt+J` | `Cmd+Alt+J` |
| **复制为 SQL** | `Ctrl+Alt+Q` | `Cmd+Alt+Q` |
| **复制 Arthas Vmtool** | `Ctrl+Alt+1` | `Cmd+Alt+1` |
| **复制 Arthas TimeTunnel** | `Ctrl+Alt+2` | `Cmd+Alt+2` |
| **Arthas 命令库** | `Ctrl+Alt+3` | `Cmd+Alt+3` |
| **复制纯文本** | `Ctrl+Shift+C` | `Cmd+Shift+C` |
| **粘贴为 Java 字符串** | `Ctrl+Shift+V` | `Cmd+Shift+V` |

## ✨ 功能详解

### 1️⃣ 📌 复制引用路径 (Copy Reference)
提取 Java 全限定路径（包名+类名+方法名），快速复制类和方法的完整引用。
- **核心功能**：一键提取完整的 Java 路径
- **应用场景**：文档注释、日志记录、代码引用
- **快捷键**：`Ctrl+Alt+R` (Windows) / `Cmd+Alt+R` (macOS)

### 2️⃣ 🌐 复制 REST 路径 (Copy REST Full Path)
自动识别并拼接 REST 接口的完整路径。支持三种主流框架：

**Spring MVC 风格** ✅
- `@RequestMapping`, `@GetMapping`, `@PostMapping`, `@PutMapping`, `@DeleteMapping` 等
- 自动融合类级和方法级路径

**JAX-RS 风格** ✅
- `@Path` 注解（类和方法级别）
- 完整路径自动拼接

**Feign Client 风格** ✅
- `@FeignClient` + `@RequestMapping` 组合
- 自动识别客户端和接口路径

**功能特性**：
- 完整路径拼接：自动融合 Controller 与 Method 层的 Mapping 路径
- **快捷键**：`Ctrl+Alt+A` (Windows) / `Cmd+Alt+A` (macOS)

### 3️⃣ 🎯 导航到 Controller (Navigate to Controller)
输入或粘贴 REST 路径/完整 URL，一键定位对应的 Controller 代码。

**核心特性**：
- **智能 URL 解析**：支持识别完整 URL（如 `http://api.example.com:8080/api/user/list`），自动提取 path 部分
- **多层级匹配**：精确匹配 → 前缀匹配 → 路径后缀匹配，提高命中率
- **缓存加速**：首次搜索 3-5 秒，后续搜索 **10ms**（**300-500x 性能提升**）
- **文件自动更新**：监听工作区文件变化，自动标记缓存为陈旧
- **三框架支持**：Spring、JAX-RS、Feign 完全兼容
- **快捷键**：`Ctrl+Alt+N` (Windows) / `Cmd+Alt+N` (macOS)

### 4️⃣ 📦 复制为 JSON (Copy as JSON)
将 Java 类或选中的字段转换为 JSON 结构。

**功能特性**：
- **自动类型识别**：基本类型、集合、日期等自动生成对应的 Mock 值
- **选区支持**：选中字段时只转换选中部分；选中类名时转换全量 JSON
- **精准类型映射**：正确处理 `Integer`、`BigDecimal`、`Long` 等数值类型
- **动态时间戳** ⏰：Mock 日期/时间字段时，自动使用当前系统时间
- **性能优化**：字段类型解析结果缓存，重复操作性能提升 **~70%**
- **快捷键**：`Ctrl+Alt+J` (Windows) / `Cmd+Alt+J` (macOS)

### 5️⃣ 📊 复制为 SQL (Copy as SQL Select)
将 Java 实体类转换为 SQL SELECT 语句。

**功能特性**：
- **命名自动转译**：智能将驼峰命名（CamelCase）转为下划线命名（snake_case）
- **表名智能清洗**：自动识别并清洗 `Entity/DTO/VO/POJO/Bean` 后缀，还原真实表名
- **字段精准过滤**：自动剔除 `List`、`Map`、`Stream`、`Optional` 等非数据库字段，仅保留基础类型
- **完美容错**：即使类中仅包含复杂类型字段，也能正确处理
- **快捷键**：`Ctrl+Alt+Q` (Windows) / `Cmd+Alt+Q` (macOS)

**示例**：
``java
public class UserDTO {
    private String userId;
    private String userName;
    private List<String> roles;  // 自动过滤
}
```
↓ 转换为 ↓
``sql
SELECT user_id, user_name FROM user
```

### 6️⃣ 🔧 Arthas 诊断命令

#### 复制 Arthas Vmtool
生成 Arthas vmtool 命令，快速查看和修改内存数据。
- **自动参数识别**：自动识别方法参数类型
- **中文参数支持**：自动转为 Unicode 转义序列（`\uXXXX` 格式），安全跨环境执行
- **快捷键**：`Ctrl+Alt+1` (Windows) / `Cmd+Alt+1` (macOS)

#### 复制 Arthas TimeTunnel
生成 Arthas tt 时间隧道命令，记录和回放方法执行。
- **执行记录**：快速生成方法执行记录命令
- **生产回溯**：实现生产现场问题回溯
- **快捷键**：`Ctrl+Alt+2` (Windows) / `Cmd+Alt+2` (macOS)

#### Arthas 命令库（59+ 命令）
快速访问完整的 Arthas 诊断命令库，包括：

**方法监控** (22 个)
- watch, trace, stack, monitor, sm, tt, ognl, getstatic, invoke 等

**类检查** (13 个)
- jad, sc, classloader, dump, redefine, mbean, search 等

**全局监控** (24 个)
- sysprop, thread, jvm, dashboard, heapdump, histogram, vmtool, vmoption, perfcounter, profiler 等

- **快捷键**：`Ctrl+Alt+3` (Windows) / `Cmd+Alt+3` (macOS)

### 7️⃣ 📄 复制纯文本 (Copy Pure Content)
提取字符串中的纯文本，自动去除转义字符。
- **转义清理**：剥离 `\n`, `\t`, `\\` 等转义字符
- **格式净化**：将转义后的文本恢复为原始内容
- **快捷键**：`Ctrl+Shift+C` (Windows) / `Cmd+Shift+C` (macOS)

### 8️⃣ 📌 粘贴为 Java 字符串 (Paste as Java String)
智能粘贴为 Java 字符串，自动转义特殊字符。
- **自动转义**：自动转义 `"`, `\\`, 换行符等特殊字符
- **快速粘贴**：一键粘贴为标准 Java 字符串
- **快捷键**：`Ctrl+Shift+V` (Windows) / `Cmd+Shift+V` (macOS)

## 🚀 快速开始

### 第 1 步：卸载旧版本（如有）
如果之前安装了 **Advanced Copy for Java**，请先卸载以避免快捷键冲突：
- 在 VSCode 扩展市场搜索 "Advanced Copy for Java"
- 点击卸载

### 第 2 步：安装此工具集
- 搜索 "Java Dev Toolkit"
- 点击安装

### 第 3 步：开始使用
- 打开 Java 文件
- **右键点击**代码位置，选择 **Java Dev Toolkit** 菜单
- 或使用上面的快捷键表直接操作

## 💡 使用建议

| 场景 | 推荐方案 |
| :--- | :--- |
| **日常开发** | 使用快捷键最快，右键菜单为备选 |
| **REST 调试** | Copy REST Full Path + Navigate to Controller 配合使用 |
| **数据库操作** | Copy as SQL Select 快速生成 SQL 模板 |
| **性能诊断** | Copy Arthas Commands 快速生成诊断命令 |
| **代码文档** | Copy Reference 快速复制完整引用 |
| **JSON 处理** | Copy as JSON 快速生成 Mock 数据 |

## 📝 版本历史

### v1.1.3（维护版本）- 最新版 ⭐

- **版本统一**：所有别名插件均基于完整的 Java Dev Toolkit 实现重新生成。
- **打包清理**：VSIX 仅包含运行时插件文件和必要文档。

### v1.1.2（REST 导航与模糊搜索）

- **REST 模糊导航**：支持错别字容错、前缀、后缀、驼峰、缩写和相似度匹配。
- **Controller 索引**：支持 Spring MVC、Spring Cloud Feign 和 JAX-RS，并按工作区隔离缓存。
- **实时更新**：Java 文件变化后增量更新索引，无需每次重新扫描整个项目。

### v1.1.0（SQL 字段过滤增强）
- **复杂类型过滤**：增加 Stream、Optional、Supplier、Consumer、Function、Predicate、Comparator 过滤
- **正则表达式改进**：增强字段声明正则，支持注解、volatile 修饰符、嵌套泛型
- **代码质量**：提取公共逻辑到可复用函数（isComplexType、getFieldRegex）
- **性能优化**：通过优化正则表达式提升 SQL 生成性能

### v1.0.2 (SQL 字段识别修复)
- **字段识别改进**：改为黑名单机制，只排除 List/Map/Set/Collection/Array 等复杂类型
- **功能对齐**：Copy SQL 现在与 Copy JSON 的字段识别逻辑完全一致
- **Bug 修复**：修复在类名上复制 SQL 时无法识别字段的问题
- **用户体验**：在类名上复制 SQL 现在能正确显示所有字段，而不是 SELECT *

### v1.0.1 (菜单名称统一)
- **菜单名称同步**：右键菜单名称从 "JavaDev Copilot" 更新为 "Java Dev Toolkit"
- **品牌统一**：所有UI元素、文档、菜单名称完全对齐
- **快速开始优化**：简化升级说明，只提示卸载 Advanced Copy for Java

### v1.0.0 (品牌重塑)
- **品牌升级**：从 JavaDev Copilot 更名为 Java Dev Toolkit
- **清晰定位**：强调工具集合，完全匹配当前和未来的功能规划
- **功能完整**：10 个命令 + 完整快捷键配置 + 单层菜单设计
- **质量保证**：修复了 SQL 字段过滤、菜单结构优化等多个问题

## 📦 项目信息

- **发布者**: qinlinglong
- **仓库**: https://github.com/qinlinglong/java-dev-toolkit
- **License**: MIT
- **最小 VSCode 版本**: 1.75.0

## 🎯 核心优势

✨ **专为 Java 开发优化** - 10+ 精选功能，覆盖日常开发全场景

⚡ **极速执行** - 缓存加速，后续搜索 10ms 响应，性能提升 300-500 倍

🔄 **多框架支持** - Spring、JAX-RS、Feign 三种主流框架完全兼容

🎨 **智能转换** - JSON/SQL 自动识别类型，驼峰/下划线自动转译

🚀 **诊断利器** - 59+ Arthas 命令库，快速定位生产问题

---

**享受高效的 Java 开发体验！** 🎉
