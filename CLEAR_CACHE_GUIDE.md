# Controller 导航缓存清理指南

## 概述
本文档说明如何清除 Advanced Copy for Java 中 REST 搜索定位 Controller 功能的缓存数据。

## 三种缓存清理方法

### 方法 1️⃣：VS Code 命令行清理（推荐）

#### 在 VS Code 中直接使用
1. 打开 VS Code Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)
2. 搜索 "Clear Controller" 或输入完整命令 "Advanced Copy: Clear Controller Navigation Cache"
3. 按 Enter 执行

**效果**：
- ✅ 清空内存索引
- ✅ 删除磁盘缓存文件
- ✅ 清除 VS Code 全局状态缓存
- ✅ 显示成功提示信息

### 方法 2️⃣：手动删除磁盘缓存文件

#### 找到缓存文件位置

缓存文件存储在用户主目录：
```bash
# macOS / Linux
~/.vscode-advanced-copy-cache-{workspaceHash}.json

# Windows
%USERPROFILE%\.vscode-advanced-copy-cache-{workspaceHash}.json
```

其中 `{workspaceHash}` 是工作区路径的 MD5 哈希的前 8 位。

#### 清理命令

**macOS / Linux**:
```bash
# 查看所有缓存文件
ls -la ~/ | grep "vscode-advanced-copy-cache"

# 删除所有缓存文件
rm ~/.vscode-advanced-copy-cache-*.json
```

**Windows (PowerShell)**:
```powershell
# 查看缓存文件
Get-ChildItem -Path "$env:USERPROFILE" -Filter ".vscode-advanced-copy-cache-*"

# 删除所有缓存文件
Remove-Item "$env:USERPROFILE\.vscode-advanced-copy-cache-*" -Force
```

### 方法 3️⃣：在代码中清除 VS Code 全局状态缓存

如果只想清除 VS Code 的全局状态存储（不删除磁盘文件），可以在 VS Code 开发者工具中执行：

```javascript
// 在 VS Code 调试控制台中执行
vscode.globalState.update('controllerIndexCache', undefined)
```

## 缓存清理范围

执行清理操作会清除以下所有内容：

| 类型 | 内容 | 效果 |
|------|------|------|
| **内存** | controllerPathIndex, controllerLayeredIndex, suffixIndexL1/L2 | 立即释放内存 |
| **内存标志** | controllerIndexInitialized, controllerIndexBuildTime, isIndexBuilding | 重置为初始状态 |
| **磁盘文件** | ~/.vscode-advanced-copy-cache-{hash}.json | 删除缓存文件 |
| **全局状态** | VS Code globalState 中的 controllerIndexCache | 清除备份数据 |

## 何时需要清理缓存

- 🔍 导航搜索结果不准确或异常
- 🐛 功能出现异常行为（如卡顿、错误结果）
- 📁 工作区大幅变动（大量文件变更）
- 🚀 想重新建立索引以获得最新数据
- 💾 需要释放磁盘空间（每个缓存文件通常 100KB-2MB）

## 清理后的行为

清理缓存后：

1. **首次搜索**: 插件会重新扫描所有 Java 文件并构建索引（通常 3-5 秒）
2. **进度提示**: 会显示"正在构建索引..."的进度条
3. **后续搜索**: 使用新建立的缓存，速度很快（10-50ms）
4. **自动同步**: 文件监听器会自动跟踪文件变化并更新缓存

## 性能对比

| 操作 | 第一次搜索 | 后续搜索 |
|------|----------|--------|
| **清理前** | 10-50ms（使用缓存） | 10-50ms |
| **清理后** | 3-5s（重建索引） | 10-50ms（使用新缓存） |

## 故障排除

### 缓存清除失败
**症状**: 命令执行后没有提示或提示错误

**解决方案**:
1. 检查 VS Code 是否正常运行
2. 查看 VS Code 输出面板 (View → Output) 中的 "Advanced Copy" 日志
3. 手动删除磁盘缓存文件（方法 2）
4. 重新启动 VS Code

### 缓存仍然有效
**症状**: 清理后第一次搜索仍然很快（没有重建索引的进度条）

**原因**: VS Code 全局状态缓存未完全清除

**解决方案**:
1. 完全关闭 VS Code（包括所有窗口）
2. 手动删除磁盘缓存文件
3. 重启 VS Code

## 相关代码位置

- **清理函数**: extension.js 第 163-197 行
- **命令注册**: extension.js 第 2477-2488 行
- **package.json**: 第 69-71 行（commands），第 99-101 行（menus）

## 更多信息

- 🔗 GitHub: https://github.com/qinlinglong/advanced-copy
- 📖 README: 本项目的 README.md
- 🐛 问题报告: GitHub Issues
