"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deactivate = exports.activate = void 0;
const vscode = __importStar(require("vscode"));
function activate(context) {
    console.log('Advanced Copy for Java is now active!');
    // REST导航命令
    let restNavigate = vscode.commands.registerCommand('advanced-copy-java.restNavigate', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active editor found');
            return;
        }
        // 获取当前工作区中的所有Java文件
        const javaFiles = await vscode.workspace.findFiles('**/*.java');
        // 获取用户输入的REST路径
        const restPath = await vscode.window.showInputBox({
            prompt: 'Enter REST endpoint path (supports fuzzy matching)',
            placeHolder: '/api/users/{id} or users/{id}'
        });
        if (!restPath) {
            return;
        }
        // 解析输入的REST路径
        const parsedPath = parseRestPath(restPath);
        // 搜索匹配的Java类和方法
        const matches = await findMatchingEndpoints(javaFiles, parsedPath);
        if (matches.length === 0) {
            vscode.window.showInformationMessage(`No matching endpoints found for: ${restPath}`);
            return;
        }
        // 如果只有一个匹配项，直接跳转；如果有多个，让用户选择
        if (matches.length === 1) {
            await navigateToEndpoint(matches[0]);
        }
        else {
            const selected = await vscode.window.showQuickPick(matches.map(m => ({
                label: `${m.className}.${m.methodName}`,
                detail: `${m.filePath}:${m.lineNumber} - ${m.endpointAnnotation}`,
                value: m
            })), { placeHolder: 'Select a matching endpoint' });
            if (selected) {
                await navigateToEndpoint(selected.value);
            }
        }
    });
    context.subscriptions.push(restNavigate);
}
exports.activate = activate;
// 解析REST路径，提取关键部分用于模糊匹配
function parseRestPath(path) {
    // 移除开头的斜杠并分割路径段
    const cleanPath = path.replace(/^\//, '');
    const segments = cleanPath.split('/');
    // 保留所有非空路径段（包括参数占位符），用于更全面的匹配
    return segments.filter(segment => segment.length > 0);
}
// 查找匹配的端点
async function findMatchingEndpoints(javaFiles, targetPathSegments) {
    const matches = [];
    for (const file of javaFiles) {
        const content = (await vscode.workspace.fs.readFile(file)).toString();
        const lines = content.split('\n');
        // 简单的正则表达式来查找Spring注解
        const endpointRegex = /(GetMapping|PostMapping|PutMapping|DeleteMapping|PatchMapping|RequestMapping)/g;
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const endpointMatch = endpointRegex.exec(line);
            if (endpointMatch) {
                // 找到包含端点注解的行
                const annotationLine = line.trim();
                // 尝试提取路径值
                const pathMatch = /value\s*=\s*\{\s*["']([^"']+)["']|value\s*=\s*["']([^"']+)["']|["']([^"']+)["']/.exec(annotationLine);
                let extractedPath = '';
                if (pathMatch) {
                    extractedPath = pathMatch[1] || pathMatch[2] || pathMatch[3] || '';
                }
                else {
                    // 如果没有找到显式的value，尝试其他可能的模式
                    const pathPattern = /=\s*\{\s*["']([^"']+)["']/.exec(line);
                    if (pathPattern) {
                        extractedPath = pathPattern[1];
                    }
                }
                if (extractedPath) {
                    // 计算模糊匹配得分
                    const matchScore = calculateFuzzyMatchScore(extractedPath, targetPathSegments);
                    // 只有当匹配得分大于0时才认为是匹配
                    if (matchScore > 0) {
                        // 尝试找到类名和方法名
                        const className = extractClassName(content, i);
                        const methodName = extractMethodName(lines, i);
                        matches.push({
                            filePath: file.path,
                            lineNumber: i + 1,
                            endpointAnnotation: annotationLine,
                            pathValue: extractedPath,
                            className: className || 'Unknown',
                            methodName: methodName || 'Unknown',
                            matchScore: matchScore
                        });
                    }
                }
            }
        }
    }
    // 按匹配得分降序排序
    matches.sort((a, b) => b.matchScore - a.matchScore);
    return matches;
}
// 计算模糊匹配得分（支持全模糊匹配）
function calculateFuzzyMatchScore(endpointPath, targetPathSegments) {
    if (targetPathSegments.length === 0) {
        return 0;
    }
    // 清理端点路径：移除参数占位符，转换为小写
    const cleanEndpointPath = endpointPath.replace(/\{[^}]+\}/g, '').toLowerCase();
    const endpointPathSegments = cleanEndpointPath.split('/').filter(s => s.length > 0);
    let totalScore = 0;
    let matchedSegments = 0;
    // 对每个目标路径段计算匹配得分
    for (const targetSegment of targetPathSegments) {
        const cleanTargetSegment = targetSegment.toLowerCase();
        let bestSegmentScore = 0;
        // 与每个端点路径段进行比较
        for (const endpointSegment of endpointPathSegments) {
            const score = fuzzyStringMatch(cleanTargetSegment, endpointSegment);
            if (score > bestSegmentScore) {
                bestSegmentScore = score;
            }
        }
        // 如果找到了匹配，累加得分
        if (bestSegmentScore > 0) {
            totalScore += bestSegmentScore;
            matchedSegments++;
        }
    }
    // 计算最终得分：考虑匹配的目标段数量和平均匹配质量
    if (matchedSegments === 0) {
        return 0;
    }
    // 基础得分：匹配段的比例 * 平均匹配质量
    const matchRatio = matchedSegments / targetPathSegments.length;
    const avgQuality = totalScore / matchedSegments;
    // 最终得分 = 匹配比例 * 平均质量 * 权重因子
    return matchRatio * avgQuality * 100;
}
// 模糊字符串匹配算法（支持子串、编辑距离等）
function fuzzyStringMatch(target, source) {
    if (!target || !source) {
        return 0;
    }
    // 完全匹配
    if (target === source) {
        return 1.0;
    }
    // 包含关系（双向）
    if (source.includes(target)) {
        // 源字符串包含目标字符串，根据长度比例给分
        return 0.9 * (target.length / source.length);
    }
    if (target.includes(source)) {
        // 目标字符串包含源字符串
        return 0.8 * (source.length / target.length);
    }
    // 计算最长公共子序列长度
    const lcsLength = longestCommonSubsequence(target, source);
    const maxLen = Math.max(target.length, source.length);
    if (lcsLength > 0) {
        // LCS得分：公共子序列长度占最大长度的比例
        const lcsScore = lcsLength / maxLen;
        // 如果LCS长度超过阈值，认为有匹配
        if (lcsScore > 0.5) {
            return lcsScore * 0.7; // 降低权重，因为这是较弱的匹配
        }
    }
    // 检查是否有共同的词根或缩写
    const commonPrefix = getCommonPrefix(target, source);
    if (commonPrefix.length >= 2) {
        return 0.5 * (commonPrefix.length / Math.max(target.length, source.length));
    }
    return 0;
}
// 计算最长公共子序列长度
function longestCommonSubsequence(str1, str2) {
    const m = str1.length;
    const n = str2.length;
    // 创建二维数组存储子问题的解
    const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
    // 填充dp表
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            if (str1[i - 1] === str2[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1] + 1;
            }
            else {
                dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
            }
        }
    }
    return dp[m][n];
}
// 获取两个字符串的公共前缀
function getCommonPrefix(str1, str2) {
    let i = 0;
    while (i < str1.length && i < str2.length && str1[i] === str2[i]) {
        i++;
    }
    return str1.substring(0, i);
}
// 提取类名
function extractClassName(content, position) {
    // 向上搜索直到找到类声明
    const lines = content.split('\n');
    for (let i = position; i >= 0; i--) {
        const line = lines[i];
        const classMatch = /public\s+(?:abstract\s+|final\s+)?class\s+(\w+)|class\s+(\w+)/.exec(line);
        if (classMatch) {
            return classMatch[1] || classMatch[2];
        }
    }
    return null;
}
// 提取方法名
function extractMethodName(lines, position) {
    // 向前搜索找到方法声明
    for (let i = position; i >= 0; i--) {
        const line = lines[i].trim();
        // 匹配方法签名
        const methodMatch = /^[\w\s<>[\]]+\s+(\w+)\s*\([^)]*\)\s*(?:throws\s+[\w,\s<>]+)?\s*\{/i.exec(line);
        if (methodMatch) {
            return methodMatch[1];
        }
        // 检查是否是注解行
        if (line.includes('@') && !line.includes('//')) {
            continue; // 跳过注解行继续查找
        }
        // 检查是否是方法声明的一部分（如返回类型在上一行）
        if (i > 0) {
            const prevLine = lines[i - 1].trim();
            const combinedLine = prevLine + ' ' + line;
            const combinedMethodMatch = /^[\w\s<>[\]]+\s+(\w+)\s*\([^)]*\)\s*(?:throws\s+[\w,\s<>]+)?\s*\{/i.exec(combinedLine);
            if (combinedMethodMatch) {
                return combinedMethodMatch[1];
            }
        }
    }
    return null;
}
// 导航到端点
async function navigateToEndpoint(match) {
    try {
        const document = await vscode.workspace.openTextDocument(match.filePath);
        const editor = await vscode.window.showTextDocument(document);
        // 将光标移动到匹配的行
        const line = match.lineNumber - 1; // 转换为0基索引
        const range = new vscode.Range(line, 0, line, 0);
        editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
        editor.selection = new vscode.Selection(range.start, range.end);
    }
    catch (error) {
        vscode.window.showErrorMessage(`Could not open file: ${match.filePath}`);
    }
}
function deactivate() { }
exports.deactivate = deactivate;
//# sourceMappingURL=extension.js.map