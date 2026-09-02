# VS Code 插件打包规则

本项目的所有 VSIX 发布包必须遵守以下规则。

## 1. 代码来源

- 所有插件必须使用本项目根目录的 `extension.js` 作为唯一运行时代码来源。
- 不得直接使用 `code/plugins/*/src`、`dist`、历史 release 目录或旧 VSIX 中的代码。
- 别名插件只允许修改插件元数据（名称、显示名称、版本等），不得使用别名目录中的占位实现替代本项目功能。

## 2. 插件命名

对于 `code/plugins/` 下的每个插件目录：

- VSIX 文件名必须为 `<目录名>-<版本>.vsix`。
- `package.json.name` 必须与目录名完全一致。
- `package.json.displayName` 必须与该插件名称对应，使用单词首字母大写的显示形式。
- 每个别名插件的 README 标题、产品名称和安装/使用提示必须与该插件的 `displayName` 同步。
- 所有插件 README 中的 Git 仓库链接统一指向 `https://github.com/qinlinglong/java-dev-toolkit`，不得按别名修改仓库地址。
- VSIX 文件名、`package.json.name` 和插件目录名三者不得不一致。
- `package.json.main` 必须为 `./extension.js`。

当前需要生成的插件清单：

- `java-assistant`
- `java-code-assistant`
- `java-code-helper`
- `java-code-toolkit`
- `java-dev-assistant`
- `java-dev-helper`
- `java-dev-toolkit`
- `java-efficient-assistant`
- `java-helper`
- `java-pro-toolkit`
- `java-quick-toolkit`
- `java-smart-helper`
- `java-toolkit`
- `javadev-copilot`（显示名称：`JavaDev Copilot`）
- `advanced-copy-for-java`（显示名称：`Advanced Copy for Java`）

例如：

```text
目录：java-code-helper
文件：java-code-helper-1.1.3.vsix
name：java-code-helper
displayName：Java Code Helper
```

## 3. 版本发布

- 主项目和所有别名插件必须使用同一个发布版本号。
- 升级版本时必须同步更新根目录 `package.json`、`README.md` 和 `CHANGELOG.md`。
- 每次发布都要重新生成主包和全部别名包，不能沿用旧版本 VSIX。

## 4. VSIX 内容

VSIX 只能包含运行所需文件和必要文档：

- `extension.js`
- `package.json`
- `logo-128.png`
- `README.md`/`readme.md`
- `CHANGELOG.md`/`changelog.md`
- `LICENSE.txt`
- VS Code 生成的 `extension.vsixmanifest` 和 `[Content_Types].xml`

不得包含：

- `node_modules/`、`test/`、源码映射和临时文件
- `.claude/`、`.vscode/` 等本地开发配置
- `extension.js.backup` 等备份文件
- 历史 `release/`、旧版 VSIX/ZIP 或生产包解包目录

根目录 `.vscodeignore` 是唯一的 VSIX 忽略规则来源，新增开发文件时必须同步评估是否需要加入忽略列表。

## 5. 打包与验收

打包前运行：

```bash
node --check extension.js
npm test
npm run compile
```

每个生成的 VSIX 都必须逐包检查：

1. `package.json.version` 等于目标发布版本。
2. `package.json.name` 等于目录名和 VSIX 文件名前缀。
3. `package.json.main` 为 `./extension.js`。
4. 命令数量和主项目一致（当前版本为 11 个）。
5. 包内 `extension/extension.js` 的 SHA-256 与根目录 `extension.js` 一致。
6. 包内不存在测试、依赖、备份、历史发布物或本地配置。

主包输出到项目根目录；别名插件输出到 `code/dist/`，文件名使用各自插件目录名和目标版本号。
