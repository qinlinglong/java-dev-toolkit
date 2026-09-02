const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

// ============== 性能优化：预编译常量 ==============

// 正则表达式预编译（避免重复编译成本）
const PACKAGE_REGEX = /^package\s+([\w.]+);/m;
const CLASS_MAPPING_REGEX = /@RequestMapping\s*\(\s*(?:(?:value|path)\s*=\s*)?"([^"]+)"/;
const METHOD_MAPPING_REGEX = /@(?:Post|Get|Put|Delete|Patch|Request)Mapping\s*\(\s*(?:(?:value|path)\s*=\s*)?"([^"]+)"/;
const ANNOTATION_REGEX = /@\w+(\(.*\))?/g;
const WORD_SPLIT_REGEX = /\s+/;
const BRACKET_CONTENT_REGEX = /\(.*$/;
const CLASS_NAME_PLACEHOLDER = '{className}';
const METHOD_NAME_PLACEHOLDER = '{methodName}';

// 符号类型常量（使用 Set 提高查询速度，从 O(n) 降低到 O(1)）
const CLASS_KINDS = new Set([4, 9, 10]);       // class, interface, enum
const FIELD_KINDS = new Set([7, 13, 14]);      // field, property, variable

// 类型分类系统（统一类型判断逻辑）
const TYPE_CATEGORIES = {
    NUMERIC: ['byte', 'short', 'int', 'long', 'float', 'double', 'decimal', 'big', 'integer', 'number', 'bigdecimal', 'biginteger'],
    STRING: ['string', 'char', 'character'],
    BOOLEAN: ['bool', 'boolean'],
    COLLECTION: ['list', 'set'],
    MAP: ['map'],
    TEMPORAL: ['date', 'time', 'stamp', 'timestamp', 'localdate', 'localdatetime', 'localtime', 'zoneddatetime', 'instant', 'offsetdatetime', 'period', 'duration', 'calendar']
};

// SQL 字段过滤：复杂类型关键字（用于 Copy as SQL 功能）
const COMPLEX_TYPE_KEYWORDS = [
    'list', 'map', 'set', 'collection', 'array',
    'stream', 'optional', 'supplier', 'consumer',
    'function', 'predicate', 'comparator'
];

// 改进的字段声明正则表达式（支持注解、volatile、嵌套泛型、数组）
// 支持：@Annotation private volatile String userId;
//      private final String[] names;
//      private Map<String, List<User>> data;
const FIELD_DECLARATION_REGEX = /(?:@\w+(?:\([^)]*\))?\s+)*(?:private|public|protected)?\s+(?:(?:static|final|volatile)\s+)*(?:(?:static|final|volatile)\s+)*(\w+(?:<(?:[^<>]|<[^<>]*>)*>)*(?:\[\])*)\s+(\w+)\s*[;=]/g;

/**
 * 获取改进的字段声明正则表达式（需要重置 lastIndex，因为使用了 g 标志）
 */
function getFieldRegex() {
    FIELD_DECLARATION_REGEX.lastIndex = 0;
    return FIELD_DECLARATION_REGEX;
}

// 性能优化：缓存对象
const symbolCache = new Map();
const fieldTypeCache = new Map();

// Controller 路径索引缓存（用于加速搜索）
const controllerPathIndex = new Map(); // 格式：path -> [{file, className, methodName, line, ...}]
const controllerLayeredIndex = {};     // 分层索引，用于高效的前缀匹配
const suffixIndexL1 = new Map();       // 第一层后缀索引：最后一段 → [paths...]（快速构建）
let suffixIndexL2 = null;              // 第二层后缀索引：所有后缀 → [paths...]（懒加载）
let controllerIndexInitialized = false;
let controllerIndexBuildTime = 0;      // 上次构建时间
let isIndexBuilding = false;           // 索引构建中标志（防止并发构建）
const fileToControllersMap = new Map(); // 文件路径 → [Controllers] 映射（用于增量更新）

// 全局变量：用于保存缓存的上下文和磁盘路径
let globalContext = null;
let DISK_CACHE_PATH = '';  // 动态设置，按工作区隔离
let lastWorkspacePath = '';  // 记录上次工作区路径，用于检测工作区切换

/**
 * 检查工作区是否已切换，如果切换则清除缓存
 */
function checkAndSwitchWorkspace() {
    const currentWorkspaceFolder = vscode.workspace.workspaceFolders?.[0];
    const currentPath = currentWorkspaceFolder?.uri.fsPath || '';

    if (currentPath && lastWorkspacePath && currentPath !== lastWorkspacePath) {
        console.log(`📁 检测到工作区切换: ${lastWorkspacePath} → ${currentPath}`);
        console.log('🧹 清除旧工作区缓存...');
        clearControllerCache();
        initCachePath();
        const newCacheLoaded = loadCache();
        if (newCacheLoaded) {
            console.log('✅ 已加载新工作区的缓存');
        } else {
            console.log('🔍 新工作区暂无缓存');
        }
    }

    lastWorkspacePath = currentPath;
}

function initCachePath() {
    // 根据当前工作区生成缓存文件路径，避免不同项目间缓存混淆
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (workspaceFolder) {
        // 使用工作区路径的哈希作为缓存文件名，确保不同工作区有不同的缓存
        const workspaceHash = crypto.createHash('md5').update(workspaceFolder.uri.fsPath).digest('hex').slice(0, 8);
        DISK_CACHE_PATH = path.join(os.homedir(), `.vscode-advanced-copy-cache-${workspaceHash}.json`);
    } else {
        // 没有打开工作区时，使用默认路径
        DISK_CACHE_PATH = path.join(os.homedir(), '.vscode-advanced-copy-cache-default.json');
    }
    console.log(`📍 缓存路径: ${DISK_CACHE_PATH}`);
}
const CACHE_VALIDITY_TIME = 5 * 24 * 60 * 60 * 1000;  // 5 天
const CHANGED_FILES = new Set();      // 追踪变化的文件
const CACHE_INVALIDATE_DELAY = 300;

/**
 * 将 Controller 索引缓存保存到磁盘（磁盘缓存是工作区隔离的）
 */
function saveCache() {
    if (!controllerIndexInitialized) return;

    const currentWorkspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';

    const cacheData = {
        timestamp: Date.now(),
        workspacePath: currentWorkspacePath,  // ✅ 记录工作区路径，用于隔离检查
        indexSize: controllerPathIndex.size,
        pathIndex: Array.from(controllerPathIndex.entries()),
        layeredIndex: controllerLayeredIndex,
        suffixIndexL1: Array.from(suffixIndexL1.entries())
    };

    // 1️⃣ 保存到磁盘（始终保存，作为备份）
    try {
        fs.writeFileSync(DISK_CACHE_PATH, JSON.stringify(cacheData), 'utf8');
        console.log(`💾 Controller 索引已保存到磁盘 (${cacheData.indexSize} 条路径)`);
    } catch (error) {
        console.warn('磁盘缓存保存失败：', error.message);
    }

    // 2️⃣ 备份到 globalState（快速启动，含工作区检查）
    if (globalContext) {
        try {
            globalContext.globalState.update('controllerIndexCache', cacheData);
            console.log('⚡ Controller 索引已保存到 globalState 缓存（快速启动）');
        } catch (error) {
            console.warn('globalState 缓存保存失败：', error.message);
        }
    }
}

/**
 * 从磁盘或 globalState 加载缓存（混合方案 + 工作区隔离检查）
 */
function loadCache() {
    let cacheData = null;
    const currentWorkspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';

    // 1️⃣ 优先从 globalState 加载（最快，但需要验证工作区）
    if (globalContext) {
        try {
            const globalCache = globalContext.globalState.get('controllerIndexCache');
            if (globalCache &&
                globalCache.timestamp &&
                Date.now() - globalCache.timestamp < CACHE_VALIDITY_TIME &&
                globalCache.workspacePath === currentWorkspacePath) {  // ✅ 检查工作区路径匹配
                cacheData = globalCache;
                console.log(`⚡ 从 globalState 加载缓存 (${globalCache.indexSize} 条路径，工作区验证通过)`);
            } else if (globalCache && globalCache.workspacePath !== currentWorkspacePath) {
                console.log(`📁 工作区已切换，忽略旧的 globalState 缓存`);
            }
        } catch (error) {
            console.warn('globalState 缓存读取失败：', error.message);
        }
    }

    // 2️⃣ globalState 不可用，从磁盘加载（备份方案）
    if (!cacheData) {
        try {
            if (fs.existsSync(DISK_CACHE_PATH)) {
                const diskCache = JSON.parse(fs.readFileSync(DISK_CACHE_PATH, 'utf8'));
                if (diskCache.timestamp && Date.now() - diskCache.timestamp < CACHE_VALIDITY_TIME &&
                    diskCache.workspacePath === currentWorkspacePath) {  // ✅ 检查工作区路径匹配
                    cacheData = diskCache;
                    console.log(`📂 从磁盘加载缓存 (${diskCache.indexSize} 条路径，工作区验证通过)`);
                } else if (diskCache && diskCache.workspacePath !== currentWorkspacePath) {
                    console.log(`📁 磁盘缓存来自其他工作区，将重新构建索引`);
                }
            }
        } catch (error) {
            console.warn('磁盘缓存加载失败：', error.message);
        }
    }

    // 3️⃣ 加载缓存数据
    if (cacheData) {
        try {
            controllerPathIndex.clear();
            Object.keys(controllerLayeredIndex).forEach(key => delete controllerLayeredIndex[key]);
            suffixIndexL1.clear();
            suffixIndexL2 = null;
            CHANGED_FILES.clear();
            fileToControllersMap.clear();

            cacheData.pathIndex.forEach(([pathKey, items]) => {
                controllerPathIndex.set(pathKey, items);
                for (const item of items) {
                    if (!item.file) continue;
                    if (!fileToControllersMap.has(item.file)) {
                        fileToControllersMap.set(item.file, []);
                    }
                    fileToControllersMap.get(item.file).push(item);
                }
            });
            Object.assign(controllerLayeredIndex, cacheData.layeredIndex);
            cacheData.suffixIndexL1.forEach(([key, paths]) => {
                suffixIndexL1.set(key, paths);
            });

            controllerIndexInitialized = true;
            controllerIndexBuildTime = cacheData.timestamp;

            return true;
        } catch (error) {
            console.warn('缓存恢复失败，将重新构建：', error.message);
            return false;
        }
    }

    return false;
}

/**
 * 清除 REST 搜索定位 Controller 的缓存文件和状态
 */
function clearControllerCache() {
    // 1️⃣ 清空内存中的索引数据
    controllerPathIndex.clear();
    Object.keys(controllerLayeredIndex).forEach(key => delete controllerLayeredIndex[key]);
    suffixIndexL1.clear();
    suffixIndexL2 = null;
    CHANGED_FILES.clear();

    // 2️⃣ 重置缓存状态标志
    controllerIndexInitialized = false;
    controllerIndexBuildTime = 0;
    isIndexBuilding = false;

    // 3️⃣ 删除磁盘缓存文件
    try {
        if (fs.existsSync(DISK_CACHE_PATH)) {
            fs.unlinkSync(DISK_CACHE_PATH);
            console.log(`🗑️  删除磁盘缓存文件: ${DISK_CACHE_PATH}`);
        }
    } catch (error) {
        console.warn('磁盘缓存文件删除失败：', error.message);
    }

    // 4️⃣ 清除 globalState 中的缓存（包含工作区路径信息）
    if (globalContext) {
        try {
            globalContext.globalState.update('controllerIndexCache', undefined);
            console.log('🗑️  已清除 globalState 缓存');
        } catch (error) {
            console.warn('globalState 缓存清除失败：', error.message);
        }
    }
}


// ============== Arthas 命令库 ==============
/**
 * @typedef {Object} ArthasCommand
 * @property {string} label - 命令显示名称
 * @property {string} template - 命令模板，支持 {className}, {methodName} 占位符
 * @property {string} description - 命令描述
 * @property {string} category - 命令分类：method/class/global
 */

const ARTHAS_COMMANDS = [
  // === 方法相关命令 ===
  { label: 'watch (监控参数返回值)', template: 'watch {className} {methodName} "{params, returnObj, throwExp}" -x 3', description: '监控方法的参数、返回值和异常', category: 'method' },
  { label: 'watch (深度监控)', template: 'watch {className} {methodName} "{params, returnObj, throwExp}" -x 4', description: '深度监控方法，展开4层（最大值）', category: 'method' },
  { label: 'watch (仅返回值)', template: 'watch {className} {methodName} "{returnObj}" -x 3', description: '仅监控返回值', category: 'method' },
  { label: 'watch (调用前)', template: 'watch {className} {methodName} "{params}" -b -x 3', description: '监控方法调用前的参数', category: 'method' },
  { label: 'watch (异常监控)', template: 'watch {className} {methodName} "{throwExp}" -e -x 3', description: '监控方法抛出的异常', category: 'method' },
  { label: 'watch (条件监控)', template: 'watch {className} {methodName} "{params, returnObj}" -x 3 "#cost>10"', description: '条件过滤监控（耗时>10ms）', category: 'method' },
  { label: 'trace (调用链追踪)', template: 'trace {className} {methodName} -n 100', description: '追踪方法调用链，展示耗时', category: 'method' },
  { label: 'trace (耗时统计)', template: 'trace {className} {methodName} -n 50 --invoke-detail', description: '追踪并显示调用详情', category: 'method' },
  { label: 'trace (性能过滤)', template: 'trace {className} {methodName} "#cost>100"', description: '只追踪耗时大于100ms的调用', category: 'method' },
  { label: 'stack (调用堆栈)', template: 'stack {className} {methodName}', description: '查看方法的调用堆栈', category: 'method' },
  { label: 'stack (条件堆栈)', template: 'stack {className} {methodName} "#cost>50"', description: '条件过滤的堆栈信息', category: 'method' },
  { label: 'monitor (监控统计)', template: 'monitor {className} {methodName} -c 5', description: '每5秒输出一次方法执行统计信息', category: 'method' },
  { label: 'monitor (自定义周期)', template: 'monitor {className} {methodName} -c 10', description: '每10秒输出一次统计信息', category: 'method' },
  { label: 'sm (搜索方法)', template: 'sm {className} {methodName}', description: '搜索并列出方法名和描述符', category: 'method' },
  { label: 'sm (详细搜索)', template: 'sm -d {className} {methodName}', description: '搜索方法并显示详细信息', category: 'method' },
  { label: 'tt (时间隧道)', template: 'tt -t {className} {methodName} -n 100', description: '记录方法调用的参数和返回值', category: 'method' },
  { label: 'tt (查看记录)', template: 'tt -i 0', description: '查看第0条记录的详细信息', category: 'method' },
  { label: 'tt (重放调用)', template: 'tt -p 0', description: '重放第0条记录的方法调用', category: 'method' },
  { label: 'tt (搜索记录)', template: 'tt -s "params[0]<0"', description: '使用条件搜索记录', category: 'method' },
  { label: 'ognl (执行OGNL表达式)', template: 'ognl -x 3 @{className}@<staticField>', description: '通过OGNL执行表达式', category: 'method' },
  { label: 'ognl (获取对象属性)', template: 'ognl @{className}@getInstance().fieldName', description: '获取对象的属性值', category: 'method' },
  { label: 'getstatic (获取静态字段)', template: 'getstatic {className} fieldName', description: '获取类的静态字段值', category: 'method' },

  // === 类相关命令 ===
  { label: 'jad (反编译类)', template: 'jad {className}', description: '反编译指定的Java类', category: 'class' },
  { label: 'jad (反编译方法)', template: 'jad {className} {methodName}', description: '仅反编译指定方法', category: 'class' },
  { label: 'sc (搜索类)', template: 'sc {className}', description: '搜索并显示类信息', category: 'class' },
  { label: 'sc (详细搜索)', template: 'sc -d {className}', description: '搜索类并显示详细信息', category: 'class' },
  { label: 'sc (模糊搜索)', template: 'sc -d *{className}*', description: '模糊搜索类', category: 'class' },
  { label: 'sc (搜索接口实现)', template: 'sc -d *implements java.io.Serializable', description: '搜索实现某接口的类', category: 'class' },
  { label: 'classloader (列出加载器)', template: 'classloader -l', description: '列出所有类加载器', category: 'class' },
  { label: 'classloader (类加载详情)', template: 'classloader -c <classloaderHash>', description: '显示特定类加载器的信息', category: 'class' },
  { label: 'classloader (查找资源)', template: 'classloader -r java/lang/String.class', description: '查找资源位置', category: 'class' },
  { label: 'dump (转储类)', template: 'dump {className}', description: '转储已加载的类', category: 'class' },
  { label: 'dump (转储到指定目录)', template: 'dump {className} /tmp', description: '转储类到指定目录', category: 'class' },
  { label: 'redefine (重新定义类)', template: 'redefine /tmp/{className}.class', description: '使用新的class文件重新定义类', category: 'class' },
  { label: 'mbean (JMX查询)', template: 'mbean', description: '列出JMX beans信息', category: 'class' },

  // === 全局命令 ===
  { label: 'sysprop (系统属性)', template: 'sysprop', description: '查看JVM系统属性', category: 'global' },
  { label: 'sysprop (查询属性)', template: 'sysprop java.version', description: '查询特定系统属性值', category: 'global' },
  { label: 'sysprop (设置属性)', template: 'sysprop <key> <value>', description: '设置系统属性（需要权限）', category: 'global' },
  { label: 'thread (线程信息)', template: 'thread', description: '查看当前线程信息', category: 'global' },
  { label: 'thread (全部线程)', template: 'thread -all', description: '查看所有线程信息', category: 'global' },
  { label: 'thread (死锁检测)', template: 'thread --state BLOCKED', description: '查找阻塞的线程', category: 'global' },
  { label: 'thread (按CPU排序)', template: 'thread -n 3 --cpu', description: '按CPU使用率排序的前3个线程', category: 'global' },
  { label: 'thread (指定线程ID)', template: 'thread <threadId>', description: '查看指定线程的详细信息', category: 'global' },
  { label: 'jvm (JVM信息)', template: 'jvm', description: '查看JVM基本信息', category: 'global' },
  { label: 'dashboard (仪表板)', template: 'dashboard', description: '实时显示仪表板', category: 'global' },
  { label: 'dashboard (指定刷新)', template: 'dashboard -n 1', description: '仪表板显示1次后退出', category: 'global' },
  { label: 'heapdump (堆转储)', template: 'heapdump /tmp/heapdump.hprof', description: '生成堆转储文件', category: 'global' },
  { label: 'heapdump (强制转储)', template: 'heapdump --live /tmp/heapdump.hprof', description: '仅转储活跃对象', category: 'global' },
  { label: 'histogram (对象统计)', template: 'histogram', description: '统计对象个数和内存占用', category: 'global' },
  { label: 'histogram (实时更新)', template: 'histogram -n 20', description: '显示前20个对象，每秒更新', category: 'global' },
  { label: 'vmtool (强制GC)', template: 'vmtool --action forceGc', description: '触发垃圾回收', category: 'global' },
  { label: 'vmtool (获取实例)', template: 'vmtool --action forceGc --className {className}', description: '获取指定类的实例', category: 'global' },
  { label: 'vmoption (查看VM选项)', template: 'vmoption', description: '查看所有JVM参数', category: 'global' },
  { label: 'vmoption (查询选项)', template: 'vmoption PrintGCDetails', description: '查询特定JVM参数值', category: 'global' },
  { label: 'vmoption (修改选项)', template: 'vmoption PrintGC true', description: '修改JVM参数', category: 'global' },
  { label: 'perfcounter (性能计数)', template: 'perfcounter', description: '查看JVM内置的性能计数器', category: 'global' },
  { label: 'profiler (采样器)', template: 'profiler start', description: '启动CPU采样', category: 'global' },
  { label: 'profiler (停止采样)', template: 'profiler stop --format html', description: '停止采样并生成HTML报告', category: 'global' }
];

// ============== 通用工具函数 ==============

/**
 * 统一的符号收集函数 - 替代重复的 collect() 定义
 * @param {Array} list - 符号列表
 * @returns {{classes: Array, fields: Array}}
 */
function collectSymbols(list) {
    const classes = [];
    const fields = [];

    function traverse(items) {
        for (const s of items) {
            if (CLASS_KINDS.has(s.kind)) {
                classes.push(s);
            }
            if (FIELD_KINDS.has(s.kind) && !s.name.includes('serialVersionUID')) {
                fields.push(s);
            }
            if (s.children) traverse(s.children);
        }
    }

    traverse(list);
    return { classes, fields };
}

/**
 * Java 字符串转义 - 避免代码重复
 */
function escapeJavaString(text) {
    return text.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * Java 字符串反转义 - 统一处理
 */
function unescapeJavaString(text) {
    return text
        .replace(/\\"/g, '"')
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r')
        .replace(/\\t/g, '\t')
        .replace(/\\\\/g, '\\');
}

/**
 * 判断字符串是否为指定类型
 */
function isTypeCategory(typeStr, category) {
    if (!typeStr) return false;
    const t = typeStr.toLowerCase();
    return TYPE_CATEGORIES[category]?.some(type => t.includes(type)) || false;
}

/**
 * 获取字段的魔法值（测试数据）
 */
function getMagicValue(type) {
    if (!type) return "test_str";

    if (isTypeCategory(type, 'COLLECTION')) return [];
    if (isTypeCategory(type, 'MAP')) return {};
    if (isTypeCategory(type, 'STRING')) return "test_str";
    if (isTypeCategory(type, 'NUMERIC')) return 0;
    if (isTypeCategory(type, 'BOOLEAN')) return true;
    if (isTypeCategory(type, 'TEMPORAL')) {
        // 使用当前时间
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    }

    return "test_str";
}

/**
 * 判断字段类型是否为复杂类型（应该从 SQL 中排除）
 * 用于 Copy as SQL 功能，过滤集合、流等非数据库列类型
 */
function isComplexType(fieldType) {
    if (!fieldType) return false;
    const lower = fieldType.toLowerCase();
    return COMPLEX_TYPE_KEYWORDS.some(kw => lower.includes(kw));
}

/**
 * 判断是否为基础类型（仅保留可以映射到数据库的基础类型）
 * 排除：List、Map、Set、Collection 和其他自定义对象类型
 */
function isBaseType(type) {
    if (!type) return false;
    const t = type.toLowerCase().replace(/[<>]/g, '').trim();

    // 首先检查是否是明确的复杂类型
    if (t.includes('list') || t.includes('map') || t.includes('set') ||
        t.includes('collection') || t.includes('array')) {
        return false;
    }

    // 然后检查是否是已知的基础类型
    return isTypeCategory(t, 'NUMERIC') ||
           isTypeCategory(t, 'STRING') ||
           isTypeCategory(t, 'BOOLEAN') ||
           isTypeCategory(t, 'TEMPORAL');
}

/**
 * 判断字段是否为静态常量（需要过滤）
 * 检查字段声明中是否包含 static 或 final 关键字
 * @param {string} fieldDeclaration - 完整的字段声明文本
 * @returns {boolean}
 */
function isStaticOrFinalField(fieldDeclaration) {
    if (!fieldDeclaration) return false;
    const text = fieldDeclaration.toLowerCase();
    return text.includes('static') || text.includes('final');
}

/**
 * 从文件名提取类名
 */
function extractClassNameFromFile(fileName) {
    return fileName.replace(/.*src.main.java./, '').replace(/\.java$/, '').replace(/[\\/]/g, '.');
}

/**
 * 驼峰转下划线
 * 支持连续大写字母（如 XMLParser -> xml_parser, TOrder -> t_order）
 */
function toSnakeCase(str) {
    if (!str) return '';

    // 1. 在连续大写字母后的小写字母前插入下划线（如 HTTPServer -> HTTP_Server）
    str = str.replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2');

    // 2. 在小写字母后的大写字母前插入下划线（如 userID -> user_ID）
    str = str.replace(/([a-z\d])([A-Z])/g, '$1_$2');

    // 3. 转为小写
    return str.toLowerCase();
}

/**
 * 清洗表名（移除实体类常见后缀并转换为下划线格式）
 *
 * 支持的后缀（大小写不敏感）：
 * - 数据对象：VO, DTO, BO, PO, DO, Entity, Bean, Model, POJO
 * - 请求相关：Req, Request, Requests, Param, Parameter, Parameters, Params, Input, Form, FormData, Query, Qry
 * - 响应相关：Resp, Response, Responses, Result, Results, Res, Output
 * - 其他：Impl, Page, Pageable, Info, Detail, Details, Config, Configuration
 *
 * 处理策略：
 * 1. 优先移除已知后缀
 * 2. 如果没有后缀，直接转换驼峰为下划线
 * 3. 如果是纯小写或包含下划线，保持原样
 */
function cleanTableName(className) {
    if (!className) return '';

    // 扩展的后缀列表，按长度降序排列（确保先匹配更长的后缀）
    const suffixes = [
        'configuration', 'parameter', 'parameters', 'formdata', 'pageable',
        'responses', 'requests', 'response', 'request', 'results', 'result',
        'entity', 'detail', 'details', 'config', 'param', 'params',
        'resp', 'res', 'form', 'query', 'qry', 'input', 'output',
        'page', 'info', 'impl',
        'vo', 'dto', 'bo', 'po', 'do', 'bean', 'model', 'pojo'
    ];

    // 构建正则表达式：匹配这些后缀中的任意一个（大小写不敏感）
    const sortedSuffixes = suffixes.sort((a, b) => b.length - a.length);
    const suffixRegex = new RegExp(`(${sortedSuffixes.join('|')})$`, 'i');

    // 尝试移除后缀
    let pureName = className.replace(suffixRegex, '').trim();

    // 如果移除后缀后为空或长度太短（小于2），使用原始类名
    if (!pureName || pureName.length < 2) {
        pureName = className;
    }

    // 转换为下划线格式
    return toSnakeCase(pureName);
}

/**
 * 优化的 replaceTemplate - 使用预编译的正则
 */
function replaceTemplate(template, className, methodName, fullClassName) {
    const classNameToUse = fullClassName || className || 'com.example.ClassName';
    return template
        .replace(/\{className\}/g, classNameToUse)
        .replace(/\{methodName\}/g, methodName || 'methodName');
}

/**
 * 中文转 ASCII 编码（拼音罗马化）
 * 将中文字符转换为数字或其他 ASCII 安全字符
 */
function chineseToAscii(str) {
    if (!str) return str;

    // 如果没有中文字符，直接返回
    if (!/[\u4e00-\u9fa5]/.test(str)) {
        return str;
    }

    // 使用 Unicode 编码替换中文字符
    // 将中文转换为 \uXXXX 格式的 Unicode 编码，然后转为字符串形式
    let result = '';
    for (let i = 0; i < str.length; i++) {
        const char = str[i];
        const code = char.charCodeAt(0);

        // 检查是否是中文字符
        if (code >= 0x4e00 && code <= 0x9fa5) {
            // 转换为十六进制编码
            result += char; // 保留原字符，并且在命令中使用转义形式
        } else {
            result += char;
        }
    }
    return result;
}

/**
 * 为中文字符添加转义，使其在 Java 字符串中安全
 */
function escapeChineseForJava(str) {
    if (!str) return str;

    // 将中文转换为 Unicode 转义序列
    let result = '';
    for (let i = 0; i < str.length; i++) {
        const char = str[i];
        const code = char.charCodeAt(0);

        // 检查是否是中文字符（CJK 统一表意文字）
        if (code >= 0x4e00 && code <= 0x9fa5) {
            // 转换为 \uXXXX 格式
            result += '\\u' + code.toString(16).padStart(4, '0');
        } else {
            result += char;
        }
    }
    return result;
}

// ============== Arthas 辅助函数 ==============

/**
 * 从Java文件中提取 package 名称
 * @param {vscode.TextDocument} document
 * @returns {string}
 */
function extractPackageName(document) {
    const text = document.getText();
    const packageMatch = text.match(/package\s+([\w.]+)\s*;/);
    return packageMatch ? packageMatch[1] : '';
}

/**
 * 从Java文件中提取 class 名称
 * @param {vscode.TextDocument} document
 * @returns {string}
 */
function extractClassName(document) {
    const text = document.getText();
    const classMatch = text.match(/(?:public\s+)?(?:class|interface|enum)\s+(\w+)/);
    return classMatch ? classMatch[1] : '';
}

/**
 * 获取当前编辑器中选中的类名或方法名
 * @returns {{className?: string, methodName?: string, fullClassName?: string}}
 */
function extractSymbols() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return {};

    const selection = editor.selection;
    const document = editor.document;
    const selectedText = document.getText(selection);

    let className = undefined;
    let methodName = undefined;

    if (selectedText.trim().length > 0) {
        if (selectedText.includes('.') || /^[A-Z]/.test(selectedText)) {
            className = selectedText.trim();
        } else {
            methodName = selectedText.trim();
        }
    }

    const line = document.lineAt(selection.start.line).text;
    if (!className) {
        const classMatch = line.match(/class\s+(\w+)/);
        className = classMatch ? classMatch[1] : undefined;
    }
    if (!methodName) {
        const methodMatch = line.match(/(?:public|private|protected)?\s*(?:static)?\s*\w+\s+(\w+)\s*\(/);
        methodName = methodMatch ? methodMatch[1] : undefined;
    }

    // 如果仍未找到方法名，优先从光标所在行向下搜索（不向上搜索，避免找到其他方法）
    if (!methodName) {
        for (let i = selection.start.line; i <= Math.min(document.lineCount - 1, selection.start.line + 10); i++) {
            const checkLine = document.lineAt(i).text;
            const methodMatch = checkLine.match(/(?:public|private|protected)?\s*(?:static)?\s*(?:synchronized)?\s*[\w<>.*]+\s+(\w+)\s*\(/);
            if (methodMatch) {
                methodName = methodMatch[1];
                break;
            }
        }
    }

    if (!className) {
        className = extractClassName(document);
    }

    let fullClassName = className;
    if (className && !className.includes('.')) {
        const packageName = extractPackageName(document);
        if (packageName) {
            fullClassName = `${packageName}.${className}`;
        }
    }

    return { className, methodName, fullClassName };
}


/**
 * 展示 Arthas 命令快速选择菜单
 * @returns {Promise<void>}
 */
async function showArthasQuickPick() {
    const symbols = extractSymbols();
    let filteredCommands = ARTHAS_COMMANDS;

    // 根据上下文过滤命令
    if (symbols.methodName && !symbols.className) {
        filteredCommands = ARTHAS_COMMANDS.filter(cmd => cmd.category !== 'class');
    } else if (symbols.className && !symbols.methodName) {
        filteredCommands = ARTHAS_COMMANDS.filter(cmd => cmd.category !== 'method');
    }

    const quickPickItems = filteredCommands.map(cmd => ({
        label: cmd.label,
        description: cmd.description,
        detail: replaceTemplate(cmd.template, symbols.className, symbols.methodName, symbols.fullClassName),
        cmd: cmd,
        symbols: symbols
    }));

    const selected = await vscode.window.showQuickPick(quickPickItems, {
        matchOnDescription: true,
        matchOnDetail: true,
        placeHolder: '选择 Arthas 命令'
    });

    if (selected) {
        // 延迟执行模板替换到选中时，而不是在显示菜单时
        const finalCommand = replaceTemplate(
            selected.cmd.template,
            selected.symbols.className,
            selected.symbols.methodName,
            selected.symbols.fullClassName
        );
        await vscode.env.clipboard.writeText(finalCommand);
        vscode.window.showInformationMessage(`✅ Arthas 命令已复制: ${finalCommand}`);
    }
}

// ============== Controller 导航工具函数 ==============

/**
 * 从用户输入解析出 REST 路径（支持完整 URL 和 URL 片段）
 * 输入示例：
 *   - /api/user/list                           → /api/user/list
 *   - /api/users/{id}                          → /api/users/{id}
 *   - user/list                                → user/list (后缀匹配)
 *   - http://api.example.com/api/user/list     → /api/user/list
 *   - https://api.example.com:8080/api/user    → /api/user
 *   - http://localhost:3000/api/user?page=1   → /api/user
 * @param {string} input - 用户输入
 * @returns {{path: string, isValid: boolean, error?: string, matchType: string}}
 */
function parseRestPathFromInput(input) {
    if (!input || !input.trim()) {
        return { isValid: false, error: '输入不能为空', path: '' };
    }

    let restPath = input.trim();
    let isFullUrl = false;
    let matchType = 'exact'; // 默认为精确匹配

    // 判断是否为完整 URL（以 http:// 或 https:// 开头）
    if (restPath.startsWith('http://') || restPath.startsWith('https://')) {
        isFullUrl = true;
        try {
            // 解析 URL
            const url = new URL(restPath);
            // 提取 pathname 部分（自动去掉 query 和 hash）
            restPath = url.pathname;

            // 验证是否以 / 开头且至少有路径部分
            if (!restPath || restPath === '/') {
                return {
                    isValid: false,
                    error: 'URL 中未找到有效的 API 路径',
                    path: ''
                };
            }
        } catch (e) {
            return {
                isValid: false,
                error: 'URL 格式无效',
                path: ''
            };
        }
    } else {
        // 非 URL 形式，可能是路径片段 (例如: user/list)
        // 判断是否为路径片段（不以 / 开头）
        if (!restPath.startsWith('/')) {
            // 这是一个路径片段，后缀匹配
            matchType = 'suffix';
            // 片段不需要 / 前缀，保持原样
        } else {
            // 完整路径，精确或前缀匹配
            matchType = 'path';
        }

        // 去掉 query 和 hash 部分（如果有）
        restPath = restPath.split('?')[0].split('#')[0];
    }

    return {
        isValid: true,
        path: restPath,
        matchType: matchType,  // exact/prefix/suffix
        fromUrl: isFullUrl
    };
}

/**
 * 构建分层路径索引，用于高效的前缀匹配
 * 将平面路径索引转换为树形结构
 *
 * 示例：
 *   输入: Map { "/api/user/list" → [...], "/api/user/delete" → [...] }
 *   输出: { api: { user: { list: [...], delete: [...] } } }
 *
 * @param {Map} flatIndex - 平面 Map 索引
 * @returns {Object} 分层索引对象
 */
/**
 * 收集分层索引中某个节点下的所有 controllers（包括子节点）
 * @param {Object} node - 分层索引中的一个节点
 * @returns {Array} 该节点及所有子节点下的 controllers 扁平化数组
 */
function collectAllControllersFromLayered(node) {
    const result = [];

    function traverse(current) {
        if (!current) return;

        // 添加当前节点的 controllers
        if (current.__controllers && current.__controllers.length > 0) {
            result.push(...current.__controllers);
        }

        // 递归遍历子节点
        if (current.__children) {
            for (const child of Object.values(current.__children)) {
                traverse(child);
            }
        }
    }

    traverse(node);
    return result;
}

/**
 * 按需构建第二层后缀索引（所有可能的后缀）
 * 只在必要时调用一次，之后缓存结果
 */
function buildSuffixIndexL2() {
    if (suffixIndexL2) return;  // 已构建，直接返回

    suffixIndexL2 = new Map();

    for (const [path] of controllerPathIndex) {
        const segments = path.split('/').filter(Boolean);

        // 为所有可能的后缀创建映射（O(n*k)，但只做一次）
        for (let i = segments.length; i > 0; i--) {
            const suffix = segments.slice(i - 1).join('/');
            if (!suffixIndexL2.has(suffix)) {
                suffixIndexL2.set(suffix, []);
            }
            suffixIndexL2.get(suffix).push(path);
        }
    }

    console.log(`✅ 第二层后缀索引已构建，包含 ${suffixIndexL2.size} 个索引项`);
}

/**
 * 从分层索引中查找前缀匹配的所有 controllers（高效！O(k) k=路径段数）
 * @param {string} inputPath - 输入路径 (如 "/api/user")
 * @param {Object} layeredIndex - 分层索引
 * @returns {Array} 匹配的 controllers 列表
 */
function findByLayeredPrefix(inputPath, layeredIndex) {
    const segments = inputPath.split('/').filter(Boolean);
    let current = layeredIndex;

    // O(k) 查询，k = 输入路径段数，导航到目标节点
    for (const segment of segments) {
        if (!current[segment]) {
            return []; // 未找到匹配的前缀
        }
        current = current[segment]; // 移动到当前段的节点
    }

    // 现在 current 指向目标节点（如 layeredIndex['api']['user']）
    // 该节点有 __controllers 和 __children 属性
    const result = [];

    function collectControllers(node) {
        if (!node) return;

        // 添加当前节点的 controllers
        if (node.__controllers && node.__controllers.length > 0) {
            result.push(...node.__controllers);
        }

        // 递归遍历子节点
        if (node.__children) {
            for (const childNode of Object.values(node.__children)) {
                collectControllers(childNode);
            }
        }
    }

    collectControllers(current);
    return result;
}

// ============== 模糊匹配算法开始 ==============

/**
 * 计算两个字符串的编辑距离（Levenshtein Distance）
 */
function levenshteinDistance(str1, str2) {
    const m = str1.length;
    const n = str2.length;
    const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
    
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            if (str1[i - 1] === str2[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1];
            } else {
                dp[i][j] = Math.min(
                    dp[i - 1][j] + 1,
                    dp[i][j - 1] + 1,
                    dp[i - 1][j - 1] + 1
                );
            }
        }
    }
    
    return dp[m][n];
}

/**
 * 计算字符串相似度
 */
function calculateSimilarity(str1, str2) {
    if (!str1 || !str2) return 0;
    
    const s1 = str1.toLowerCase();
    const s2 = str2.toLowerCase();
    
    if (s1 === s2) return 1.0;
    
    const maxLen = Math.max(s1.length, s2.length);
    if (maxLen === 0) return 1.0;
    
    const distance = levenshteinDistance(s1, s2);
    return 1 - distance / maxLen;
}

/**
 * 将驼峰命名转换为单词数组
 */
function camelCaseToWords(camelCase) {
    if (!camelCase) return [];
    return camelCase.replace(/([a-z])([A-Z])/g, '$1 $2')
                    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
                    .toLowerCase()
                    .split(/\s+/)
                    .filter(w => w.length > 0);
}

/**
 * 检查输入是否为驼峰命名的缩写
 */
function isAbbreviationMatch(input, target) {
    if (!input || !target) return false;
    
    const inputLower = input.toLowerCase();
    const words = camelCaseToWords(target);
    
    if (words.length === 0) return false;
    
    const abbreviation = words.map(w => w.charAt(0)).join('');
    return abbreviation.includes(inputLower);
}

/**
 * 计算路径段的匹配得分
 */
function calculateSegmentScore(inputSeg, targetSeg) {
    if (!inputSeg || !targetSeg) return { score: 0, matchType: 'none' };
    
    const inputLower = inputSeg.toLowerCase();
    const targetLower = targetSeg.toLowerCase();
    
    // 1. 精确匹配
    if (inputLower === targetLower) {
        return { score: 1.0, matchType: 'exact' };
    }
    
    // 2. 前缀匹配
    if (targetLower.startsWith(inputLower)) {
        return { score: 0.9, matchType: 'prefix' };
    }
    
    // 3. 后缀匹配
    if (targetLower.endsWith(inputLower)) {
        return { score: 0.85, matchType: 'suffix' };
    }
    
    // 4. 包含匹配
    if (targetLower.includes(inputLower)) {
        return { score: 0.75, matchType: 'contains' };
    }
    
    // 5. 驼峰命名匹配
    const targetWords = camelCaseToWords(targetSeg);
    if (targetWords.length > 1) {
        const joinedWords = targetWords.join('');
        if (joinedWords.startsWith(inputLower)) {
            return { score: 0.8, matchType: 'camelPrefix' };
        }
        if (joinedWords.includes(inputLower)) {
            return { score: 0.7, matchType: 'camelContains' };
        }
        
        // 驼峰缩写匹配
        if (isAbbreviationMatch(inputLower, targetSeg)) {
            return { score: 0.65, matchType: 'abbreviation' };
        }
    }
    
    // 6. 编辑距离模糊匹配
    const similarity = calculateSimilarity(inputSeg, targetSeg);
    if (similarity > 0.6) {
        return { score: similarity * 0.6, matchType: 'fuzzy' };
    }
    
    return { score: 0, matchType: 'none' };
}

/**
 * 计算完整路径的匹配得分
 */
function calculatePathMatchScore(inputPath, fullPath) {
    if (!inputPath || !fullPath) return { score: 0, matchDetails: [] };
    
    const cleanInput = inputPath.replace(/^\//, '');
    const cleanFull = fullPath.replace(/^\//, '');
    
    const inputSegments = cleanInput.split('/').filter(Boolean);
    const fullSegments = cleanFull.split('/').filter(Boolean);
    
    let totalScore = 0;
    let matchedSegments = 0;
    const matchDetails = [];
    const usedTargetSegments = new Set();
    
    for (const inputSeg of inputSegments) {
        let bestSegmentScore = 0;
        let bestMatchType = 'none';
        let bestMatchedSeg = '';
        let bestMatchedIndex = -1;
        
        for (let targetIndex = 0; targetIndex < fullSegments.length; targetIndex++) {
            if (usedTargetSegments.has(targetIndex)) continue;
            const targetSeg = fullSegments[targetIndex];
            const result = calculateSegmentScore(inputSeg, targetSeg);
            
            if (result.score > bestSegmentScore) {
                bestSegmentScore = result.score;
                bestMatchType = result.matchType;
                bestMatchedSeg = targetSeg;
                bestMatchedIndex = targetIndex;
            }
        }
        
        if (bestSegmentScore > 0) {
            totalScore += bestSegmentScore;
            matchedSegments++;
            usedTargetSegments.add(bestMatchedIndex);
            matchDetails.push(`${inputSeg}→${bestMatchedSeg}(${bestMatchType})`);
        }
    }
    
    const coverageScore = matchedSegments / inputSegments.length;
    const avgQualityScore = matchedSegments > 0 ? totalScore / matchedSegments : 0;
    const allSegmentsMatch = matchedSegments === inputSegments.length;
    const bonus = allSegmentsMatch ? 0.1 : 0;
    
    return {
        score: coverageScore * 0.4 + avgQualityScore * 0.6 + bonus,
        matchDetails: matchDetails
    };
}

/**
 * 执行模糊搜索
 */
function fuzzySearchControllers(inputPath, maxResults = 20) {
    const results = [];
    
    for (const [fullPath, items] of controllerPathIndex) {
        const { score, matchDetails } = calculatePathMatchScore(inputPath, fullPath);
        
        if (score > 0.3) {
            for (const item of items) {
                results.push({
                    ...item,
                    fullPath: fullPath,
                    matchScore: score,
                    matchDetails: matchDetails,
                    matchType: score > 0.9 ? 'exact' : score > 0.7 ? 'high' : score > 0.5 ? 'medium' : 'fuzzy'
                });
            }
        }
    }
    
    results.sort((a, b) => b.matchScore - a.matchScore);
    return results.slice(0, maxResults);
}

// ============== 模糊匹配算法结束 ==============

/**
 * 增量更新 Controller 索引（仅更新指定文件的数据）
 * 删除该文件的旧数据，重新解析并添加新数据
 * @param {string} filePath - 需要更新的 Java 文件路径
 * @param {string} operation - 操作类型：'change' | 'delete' | 'create'
 * @returns {Promise<{updated: number, added: number}>}
 */
async function incrementalUpdateIndex(filePath, operation = 'change') {
    // 防止与全量构建并发
    if (isIndexBuilding) {
        console.log(`⏳ 索引正在构建中，将 ${filePath} 的变化加入待处理`);
        CHANGED_FILES.add(filePath);
        return { updated: 0, added: 0 };
    }

    const startTime = Date.now();

    try {
        // 先解析再修改索引，确保读取/解析失败时旧索引仍然可用。
        let parseResult = null;
        if (operation !== 'delete') {
            try {
                parseResult = await parseJavaFileForControllers(filePath);
            } catch (error) {
                console.warn(`⚠️  增量更新失败，保留旧缓存: ${filePath} - ${error.message}`);
                return { updated: 0, added: 0 };
            }
        }

        // 第1步：删除该文件的旧数据
        const oldControllers = fileToControllersMap.get(filePath) || [];
        let deletedCount = 0;

        for (const oldController of oldControllers) {
            const path = oldController.fullPath;
            const controllers = controllerPathIndex.get(path) || [];

            // 从路径索引中删除
            const filtered = controllers.filter(c => c.file !== filePath);
            if (filtered.length === 0) {
                controllerPathIndex.delete(path);
                // 从分层索引中删除
                const segments = path.split('/').filter(Boolean);
                if (segments.length > 0) {
                    let layeredNode = controllerLayeredIndex;
                    for (let i = 0; i < segments.length; i++) {
                        if (i === segments.length - 1 && layeredNode[segments[i]]) {
                            layeredNode[segments[i]].__controllers =
                                layeredNode[segments[i]].__controllers.filter(c => c.file !== filePath);
                        }
                        layeredNode = layeredNode[segments[i]]?.__children || {};
                    }
                }
                // 从后缀索引中删除
                if (segments.length > 0) {
                    const lastSegment = segments[segments.length - 1];
                    const paths = suffixIndexL1.get(lastSegment) || [];
                    suffixIndexL1.set(lastSegment, paths.filter(p => p !== path));
                }
            } else {
                controllerPathIndex.set(path, filtered);
            }
            deletedCount++;
        }

        // 第2步：重新解析该文件
        let newControllers = [];
        let addedCount = 0;

        if (operation !== 'delete') {
            try {
                for (const method of parseResult.methods) {
                    const path = method.fullPath;
                    const controller = {
                        file: filePath,
                        package: parseResult.package,
                        className: parseResult.className,
                        methodName: method.name,
                        line: method.line,
                        fullPath: path
                    };

                    // 添加到路径索引
                    if (!controllerPathIndex.has(path)) {
                        controllerPathIndex.set(path, []);
                    }
                    controllerPathIndex.get(path).push(controller);

                    // 添加到分层索引
                    const segments = path.split('/').filter(Boolean);
                    let layeredNode = controllerLayeredIndex;

                    for (let i = 0; i < segments.length; i++) {
                        const segment = segments[i];

                        if (!layeredNode[segment]) {
                            layeredNode[segment] = {
                                __controllers: [],
                                __children: {}
                            };
                        }

                        if (i === segments.length - 1) {
                            layeredNode[segment].__controllers.push(controller);
                        }

                        layeredNode = layeredNode[segment].__children;
                    }

                    // 添加到后缀索引
                    if (segments.length > 0) {
                        const lastSegment = segments[segments.length - 1];
                        if (!suffixIndexL1.has(lastSegment)) {
                            suffixIndexL1.set(lastSegment, []);
                        }
                        suffixIndexL1.get(lastSegment).push(path);
                    }

                    newControllers.push(controller);
                    addedCount++;
                }

                // 第二层后缀索引需要重建（删除旧的，懒加载重建）
                suffixIndexL2 = null;

                console.log(`✅ 增量更新完成: ${filePath} | 删除 ${deletedCount} 个旧路由，新增 ${addedCount} 个路由 (${Date.now() - startTime}ms)`);
            } catch (error) {
                console.warn(`⚠️  增量索引写入失败: ${filePath} - ${error.message}`);
                return { updated: deletedCount, added: 0 };
            }
        } else {
            console.log(`🗑️  文件已删除，移除 ${deletedCount} 个路由: ${filePath}`);
        }

        // 第3步：更新 fileToControllersMap
        if (newControllers.length > 0) {
            fileToControllersMap.set(filePath, newControllers);
        } else {
            fileToControllersMap.delete(filePath);
        }

        // 第4步：保存缓存
        if (controllerIndexInitialized) {
            saveCache();
        }

        return { updated: deletedCount, added: addedCount };
    } catch (error) {
        console.error(`❌ 增量更新异常: ${filePath} - ${error.message}`);
        return { updated: 0, added: 0 };
    }
}

/**
 * 构建或更新 Controller REST 路径索引
 * 扫描所有 Java 文件，提取所有 REST 路径，构建快速查询索引
 * @returns {Promise<{count: number, time: number}>}
 */
async function buildControllerPathIndex() {
    // 防止并发构建：如果正在构建，直接返回
    if (isIndexBuilding) {
        console.log('索引正在构建中，跳过重复构建请求...');
        return { count: controllerPathIndex.size, time: 0 };
    }

    isIndexBuilding = true;
    try {
        const startTime = Date.now();
        controllerPathIndex.clear();
        // 同时清空分层索引和后缀索引
        Object.keys(controllerLayeredIndex).forEach(key => delete controllerLayeredIndex[key]);
        suffixIndexL1.clear();
        suffixIndexL2 = null;  // 第二层重置为 null，下次需要时再构建
        fileToControllersMap.clear();  // 清空文件→控制器映射

        // 显示构建进度
        const result = await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: '📑 构建 Controller 索引...',
                cancellable: false
            },
            async (progress) => {
                // 查找所有 Java 文件
                const javaFiles = await vscode.workspace.findFiles('**/*.java', '**/node_modules/**');

                let processedCount = 0;

                for (const fileUri of javaFiles) {
                    try {
                        const parseResult = await parseJavaFileForControllers(fileUri.fsPath);
                        const fileControllers = [];  // 存储该文件的所有 controller

                        // 为每个方法构建所有索引（单次遍历，高效！）
                        for (const method of parseResult.methods) {
                            const path = method.fullPath;
                            const controller = {
                                file: fileUri.fsPath,  // ✅ 存储文件路径字符串，而不是 URI 对象
                                package: parseResult.package,
                                className: parseResult.className,
                                methodName: method.name,
                                line: method.line,
                                fullPath: path  // 添加 fullPath 以便后续使用
                            };

                            fileControllers.push(controller);  // 记录到文件级别

                            // 1️⃣ 添加到路径索引
                            if (!controllerPathIndex.has(path)) {
                                controllerPathIndex.set(path, []);
                            }
                            controllerPathIndex.get(path).push(controller);

                            // 2️⃣ 同时构建分层索引（一步到位）
                            const segments = path.split('/').filter(Boolean);
                            let layeredNode = controllerLayeredIndex;

                            for (let i = 0; i < segments.length; i++) {
                                const segment = segments[i];

                                // 初始化节点
                                if (!layeredNode[segment]) {
                                    layeredNode[segment] = {
                                        __controllers: [],
                                        __children: {}
                                    };
                                }

                                // 在叶子节点添加 controller
                                if (i === segments.length - 1) {
                                    layeredNode[segment].__controllers.push(controller);
                                }

                                // 移到下一层
                                layeredNode = layeredNode[segment].__children;
                            }

                            // 3️⃣ 构建第一层后缀索引（只索引最后一段 - 快速构建 O(n)）
                            // 第二层（所有后缀）按需构建，使用时再触发
                            if (segments.length > 0) {
                                const lastSegment = segments[segments.length - 1];
                                if (!suffixIndexL1.has(lastSegment)) {
                                    suffixIndexL1.set(lastSegment, []);
                                }
                                suffixIndexL1.get(lastSegment).push(path);
                            }
                        }

                        // 记录该文件的所有 controller（用于增量更新）
                        if (fileControllers.length > 0) {
                            fileToControllersMap.set(fileUri.fsPath, fileControllers);
                        }

                        processedCount++;
                        // 每处理 10 个文件更新一次进度
                        if (processedCount % 10 === 0) {
                            progress.report({
                                increment: 1,
                                message: `已扫描 ${processedCount}/${javaFiles.length} 个文件，同时构建所有索引...`
                            });
                        }
                    } catch (error) {
                        console.warn(`Could not parse ${fileUri.fsPath}: ${error.message}`);
                    }
                }

                progress.report({ increment: 100 });
                return { count: controllerPathIndex.size, filesCount: javaFiles.length };
            }
    );

    // ✅ 索引已在上面的单次遍历中全部构建完成！
    // 无需再次遍历构建分层索引或后缀索引

    const buildTime = Date.now() - startTime;
    controllerIndexInitialized = true;
    controllerIndexBuildTime = Date.now();
    isIndexBuilding = false;  // 构建完成，清除标志

    // 💾 将索引保存到磁盘和 VS Code 全局缓存（混合方案）
    saveCache();

    return {
        count: result.count,
        time: buildTime
    };
    } finally {
        isIndexBuilding = false;  // 确保异常情况下也清除标志
    }
}

/**
 * 解析 Java 文件，提取所有 Controller 方法及其路径
 * @param {string} filePath - Java 文件路径
 * @returns {Promise<{package: string, className: string, classPath: string, methods: Array}>}
 */
async function parseJavaFileForControllers(filePath) {
    const uri = vscode.Uri.file(filePath);
    const document = await vscode.workspace.openTextDocument(uri);
    const text = document.getText();

    // 1️⃣ 检查是否为 Spring REST Controller
    const isSpringController = text.match(/@(?:Rest)?Controller\b/);

    // 2️⃣ 检查是否为 Spring Cloud Feign Client
    const isFeignClient = text.match(/@FeignClient\b/);

    // 3️⃣ 检查是否为 JAX-RS REST Service（带 @Path 或 @Api）
    const isJaxRsService = text.match(/@(?:Path|Api)\b/);

    if (!isSpringController && !isFeignClient && !isJaxRsService) {
        // 既不是 Spring 也不是 JAX-RS 也不是 Feign
        return {
            package: '',
            className: '',
            classPath: '',
            methods: [],
            document: document,
            isController: false
        };
    }

    // 提取包名
    const packageMatch = text.match(/^package\s+([\w.]+)\s*;/m);
    const packageName = packageMatch ? packageMatch[1] : '';

    // 提取类名（支持 class 和 interface）
    const classMatch = text.match(/(?:public\s+)?(?:class|interface)\s+(\w+)/);
    const className = classMatch ? classMatch[1] : '';
    const classDeclarationLine = classMatch
        ? text.slice(0, classMatch.index).split('\n').length - 1
        : -1;

    // 提取类级路径（Spring: @RequestMapping 或 JAX-RS: @Path）
    let classPath = '';
    const springClassPathMatch = text.match(/@RequestMapping\s*\(\s*(?:(?:value|path)\s*=\s*)?"([^"]+)"/);
    if (springClassPathMatch) {
        classPath = springClassPathMatch[1];
    } else {
        // JAX-RS 风格：@Path("...")
        const jaxRsClassPathMatch = text.match(/@Path\s*\(\s*"([^"]+)"\s*\)/);
        if (jaxRsClassPathMatch) {
            classPath = jaxRsClassPathMatch[1];
        }
    }

    const methods = [];

    // 按行遍历，查找所有方法的映射注解
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
        // 类声明之前的映射属于类级注解，不能再次作为方法映射处理。
        if (classDeclarationLine >= 0 && i < classDeclarationLine) continue;
        const line = lines[i];

        let methodPath = '';
        let foundMapping = false;

        // Spring 风格：@RequestMapping, @PostMapping, @GetMapping 等
        const springMappingAnnotation = line.match(/@(?:Post|Get|Put|Delete|Patch|Request)Mapping\b/);
        if (springMappingAnnotation) {
            const springPathMatch = line.match(/@(?:Post|Get|Put|Delete|Patch|Request)Mapping\s*\(\s*(?:(?:value|path)\s*=\s*)?(?:\{\s*)?"([^"]*)"/);
            methodPath = springPathMatch ? springPathMatch[1] : '';
            foundMapping = true;
        }

        // JAX-RS 风格：@Path("...") + @POST/@GET/@PUT/@DELETE/@PATCH
        if (!foundMapping) {
            const jaxRsPathMatch = line.match(/@Path\s*\(\s*"([^"]+)"\s*\)/);
            const httpMethodMatch = line.match(/@(?:POST|GET|PUT|DELETE|PATCH|HEAD|OPTIONS)\b/);

            if (jaxRsPathMatch && httpMethodMatch) {
                methodPath = jaxRsPathMatch[1];
                foundMapping = true;
            } else if (httpMethodMatch) {
                foundMapping = true;
                // HTTP 方法注解存在，检查附近的 @Path
                for (let k = Math.max(0, i - 5); k < Math.min(lines.length, i + 1); k++) {
                    const pathMatch = lines[k].match(/@Path\s*\(\s*"([^"]+)"\s*\)/);
                    if (pathMatch) {
                        methodPath = pathMatch[1];
                        foundMapping = true;
                        break;
                    }
                }
            }
        }

        if (foundMapping) {
            // 向下查找方法名（最多查找5行）
            let methodName = '';
            let methodLine = -1;  // 记录方法所在的行号
            for (let j = i; j < Math.min(i + 6, lines.length); j++) {
                const methodLineText = lines[j];
                // 支持 interface 方法（无方法体）和 class 方法
                const methodMatch = methodLineText.match(/(?:public|private|protected)?\s*(?:static)?\s*(?:synchronized)?\s*[\w<>.*]+\s+(\w+)\s*\(/);
                if (methodMatch) {
                    methodName = methodMatch[1];
                    methodLine = j;  // 记录方法所在行
                    break;
                }
            }

            if (methodName) {
                // 组装完整路径
                const cleanPath = (p) => p ? p.replace(/^\/*|\/*$/g, '') : '';
                const cPart = cleanPath(classPath);
                const mPart = cleanPath(methodPath);
                const fullPath = `/${[cPart, mPart].filter(Boolean).join('/')}`;

                methods.push({
                    name: methodName,
                    path: methodPath,
                    fullPath: fullPath,
                    line: methodLine,  // 使用方法所在行而非注解行
                    range: new vscode.Range(methodLine, 0, methodLine, lines[methodLine].length)
                });
            }
        }
    }

    return {
        package: packageName,
        className: className,
        classPath: classPath,
        methods: methods,
        document: document,
        isController: true
    };
}

/**
 * 从工作区中查找匹配指定 REST 路径的 Controller（优先使用缓存）
 * @param {string} inputPath - 用户输入的 REST 路径
 * @param {boolean} useCache - 是否使用缓存（默认使用）
 * @param {string} matchType - 匹配类型：'exact' | 'prefix' | 'suffix' | 'path'
 * @returns {Promise<Array>} 匹配的 Controller 列表
 */
async function findControllersByPath(inputPath, useCache = true, matchType = 'path') {
    const matches = [];

    // 策略1：精确匹配（快速）
    if (useCache && controllerPathIndex.has(inputPath)) {
        const result = controllerPathIndex.get(inputPath).map(item => ({
            file: item.file,
            package: item.package,
            className: item.className,
            methodName: item.methodName,
            fullPath: inputPath,
            line: item.line,
            matchType: 'exact'
        }));
        // 添加搜索元数据
        result._searchInfo = {
            fromCache: true,
            indexSize: controllerPathIndex.size,
            searchType: 'exact'
        };
        return result;
    }

    // 策略2：前缀/路径/后缀匹配（使用缓存索引 - 现在使用分层索引加速！）
    if (useCache && controllerIndexInitialized) {
        // 对于非后缀匹配，首先使用前缀/路径匹配
        if (matchType !== 'suffix') {
            const layeredMatches = findByLayeredPrefix(inputPath, controllerLayeredIndex);
            for (const item of layeredMatches) {
                matches.push({
                    file: item.file,
                    package: item.package,
                    className: item.className,
                    methodName: item.methodName,
                    fullPath: item.fullPath || inputPath,
                    line: item.line,
                    matchType: item.fullPath === inputPath ? 'exact' : 'prefix'
                });
            }

            // 如果前缀匹配未找到结果，且输入以 / 开头，尝试路径后缀匹配
            // 例如：输入 /readHistory/create，不仅匹配 /readHistory/create，
            // 还匹配 /member/readHistory/create 等以这个路径结尾的完整路径
            if (matches.length === 0 && inputPath.startsWith('/')) {
                for (const [fullPath, items] of controllerPathIndex) {
                    if (fullPath !== inputPath &&
                        (fullPath.endsWith(inputPath) ||
                         fullPath.endsWith('/' + inputPath.slice(1)))) {
                        matches.push(...items.map(item => ({
                            file: item.file,
                            package: item.package,
                            className: item.className,
                            methodName: item.methodName,
                            fullPath: fullPath,
                            line: item.line,
                            matchType: 'suffix'
                        })));
                    }
                }
            }
        } else {
            // 后缀匹配：支持路径后缀（如 readHistory/create 匹配 /member/readHistory/create）
            for (const [fullPath, items] of controllerPathIndex) {
                // 检查是否以输入路径结尾
                if (fullPath === inputPath ||
                    fullPath.endsWith(inputPath) ||
                    fullPath.endsWith('/' + inputPath)) {
                    matches.push(...items.map(item => ({
                        file: item.file,
                        package: item.package,
                        className: item.className,
                        methodName: item.methodName,
                        fullPath: fullPath,
                        line: item.line,
                        matchType: fullPath === inputPath ? 'exact' : 'suffix'
                    })));
                }
            }
        }

        // 如果找到匹配项，直接返回
        if (matches.length > 0) {
            const sorted = matches.sort((a, b) => {
                // 优先级排序：精确 > 前缀 > 后缀
                if (a.matchType === 'exact' && b.matchType !== 'exact') return -1;
                if (a.matchType !== 'exact' && b.matchType === 'exact') return 1;
                if (a.matchType === 'prefix' && b.matchType === 'suffix') return -1;
                if (a.matchType === 'suffix' && b.matchType === 'prefix') return 1;
                return 0;
            });
            // 添加搜索元数据
            sorted._searchInfo = {
                fromCache: true,
                indexSize: controllerPathIndex.size,
                searchType: matchType
            };
            return sorted;
        }
    }

       // 🚀 如果缓存已初始化但精确/前缀/后缀匹配未找到结果，尝试模糊匹配
    if (controllerIndexInitialized && matches.length === 0) {
        console.log(`✅ 缓存已初始化，尝试模糊匹配...`);
        const fuzzyMatches = fuzzySearchControllers(inputPath, 20);
        
        if (fuzzyMatches.length > 0) {
            console.log(`✅ 模糊匹配找到 ${fuzzyMatches.length} 个结果`);
            matches.push(...fuzzyMatches);
            
            // 添加搜索元数据
            matches._searchInfo = {
                fromCache: true,
                indexSize: controllerPathIndex.size,
                searchType: 'fuzzy',
                fuzzyMatchCount: fuzzyMatches.length
            };
            
            return matches;
        }
        
        console.log(`⚠️ 模糊匹配也未找到结果`);
        matches._searchInfo = {
            fromCache: true,
            indexSize: controllerPathIndex.size,
            searchType: matchType,
            reason: '缓存已完成，所有匹配策略均无匹配项'
        };
        return matches;
    }

    // 只有当缓存未初始化时，才进行全量搜索（首次使用或文件监听器标记为脏）
    console.log('缓存未初始化，执行完整搜索...');

    const javaFiles = await vscode.workspace.findFiles('**/*.java', '**/node_modules/**');
    const searchStartTime = Date.now();

    for (const fileUri of javaFiles) {
        try {
            const result = await parseJavaFileForControllers(fileUri.fsPath);

            for (const method of result.methods) {
                let isMatch = false;
                let resultMatchType = '';

                if (method.fullPath === inputPath) {
                    isMatch = true;
                    resultMatchType = 'exact';
                } else if (matchType === 'suffix') {
                    // 后缀匹配：检查路径是否以输入段结尾
                    // 支持 user/list 匹配 /api/user/list 等情况
                    if (method.fullPath.endsWith(inputPath) ||
                        method.fullPath.endsWith('/' + inputPath) ||
                        method.fullPath === '/' + inputPath ||
                        method.fullPath.includes('/' + inputPath + '/')) {
                        isMatch = true;
                        resultMatchType = 'suffix';
                    }
                } else if (matchType === 'path' || matchType === 'exact') {
                    // 精确或前缀匹配
                    if (method.fullPath.startsWith(inputPath)) {
                        if (method.fullPath === inputPath) {
                            isMatch = true;
                            resultMatchType = 'exact';
                        } else if (method.fullPath[inputPath.length] === '/') {
                            // 前缀匹配：输入是路径的前缀且后面跟 /
                            isMatch = true;
                            resultMatchType = 'prefix';
                        }
                    }
                }

                if (isMatch) {
                    matches.push({
                        file: fileUri.fsPath,  // ✅ 存储文件路径字符串
                        package: result.package,
                        className: result.className,
                        methodName: method.name,
                        fullPath: method.fullPath,
                        line: method.line,
                        matchType: resultMatchType
                    });
                }
            }
        } catch (error) {
            console.warn(`Could not parse ${fileUri.fsPath}: ${error.message}`);
        }
    }

    // 结果排序
    matches.sort((a, b) => {
        if (a.matchType === 'exact' && b.matchType !== 'exact') return -1;
        if (a.matchType !== 'exact' && b.matchType === 'exact') return 1;
        return 0;
    });

    // 添加搜索元数据用于错误消息
    const searchTime = Date.now() - searchStartTime;
    matches._searchInfo = {
        fromCache: false,
        filesScanned: javaFiles.length,
        searchTime: searchTime,
        indexSize: controllerPathIndex.size
    };

    return matches;
}

/**
 * 打开文件并导航到指定行
 * @param {Object} match - 匹配结果对象
 * @param {vscode.Uri} match.file - 文件 URI
 * @param {number} match.line - 行号
 */
async function openControllerAtLine(match) {
    try {
        // 验证 match.file 是否有效
        if (!match.file) {
            throw new Error('文件路径无效');
        }

        // 如果是字符串，转换为 URI
        const fileUri = typeof match.file === 'string'
            ? vscode.Uri.file(match.file)
            : match.file;

        // 打开文件
        const editor = await vscode.window.showTextDocument(fileUri);

        // 设置光标位置并置于编辑器中心
        const range = new vscode.Range(match.line, 0, match.line, 0);
        editor.selection = new vscode.Selection(range.start, range.end);
        editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
    } catch (error) {
        vscode.window.showErrorMessage(`❌ 无法打开文件: ${error.message}`);
        console.error('openControllerAtLine error:', error);
    }
}

// ============== 通用工具函数 ==============

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
    // 💾 保存全局 context，用于缓存操作
    globalContext = context;

    // 🔄 初始化缓存路径（按工作区隔离）
    initCachePath();

    // 🔄 监听工作区变化，自动切换缓存
    let workspaceFolderChangeDisposable = vscode.workspace.onDidChangeWorkspaceFolders((event) => {
        console.log('📁 检测到工作区变化，重新初始化缓存...');
        // 清除当前工作区的缓存（内存）
        clearControllerCache();
        // 重新初始化缓存路径
        initCachePath();
        // 加载新工作区的缓存
        const newCacheLoaded = loadCache();
        if (newCacheLoaded) {
            console.log('✅ 已加载新工作区的缓存');
        } else {
            console.log('🔍 新工作区暂无缓存，将在首次搜索时构建');
        }
    });

    // 🔄 初始化当前工作区路径（用于检测工作区切换）
    const currentWorkspaceFolder = vscode.workspace.workspaceFolders?.[0];
    lastWorkspacePath = currentWorkspaceFolder?.uri.fsPath || '';
    console.log(`📁 当前工作区: ${lastWorkspacePath || '未打开工作区'}`);

    // 🔄 尝试加载缓存（混合方案：磁盘 > globalState）
    const cacheLoaded = loadCache();

    if (cacheLoaded) {
        console.log('✅ 使用缓存的 Controller 索引');
    } else {
        console.log('🔍 缓存未有效，将在首次搜索时构建索引');
    }

function getFieldType(symbol, document) {
    // 缓存检查
    const cacheKey = `${document.uri}:${symbol.name}`;
    if (fieldTypeCache.has(cacheKey)) {
        return fieldTypeCache.get(cacheKey);
    }

    try {
        let lineIndex = symbol.range.start.line;
        let lineText = "";

        for (let i = -2; i < 5; i++) {
            let idx = lineIndex + i;
            if (idx < 0 || idx >= document.lineCount) continue;

            let rawLine = document.lineAt(idx).text.trim();

            // 过滤掉干扰行
            if (rawLine.startsWith('*') || rawLine.startsWith('/*') || rawLine.startsWith('*/')) {
                continue;
            }

            if (rawLine.includes(';') && rawLine.includes(symbol.name)) {
                lineText = rawLine;
                break;
            }
        }

        if (!lineText) {
            fieldTypeCache.set(cacheKey, "String");
            return "String";
        }

        // 使用预编译的正则表达式
        let cleanText = lineText.split(';')[0]
            .replace(ANNOTATION_REGEX, '')
            .trim();

        const words = cleanText.split(WORD_SPLIT_REGEX);
        const varIdx = words.indexOf(symbol.name);

        let type = "String";
        if (varIdx > 0) {
            type = words[varIdx - 1].replace(/<.*>/g, '');
        }

        fieldTypeCache.set(cacheKey, type);
        return type;
    } catch (e) {
        return "String";
    }
}

    // --- 核心工具：获取 Java 符号及 REST 路径 ---
    async function getJavaSymbols(editor) {
        const document = editor.document;
        const fullText = document.getText();
        const symbols = await vscode.commands.executeCommand('vscode.executeDocumentSymbolProvider', document.uri);
        const pos = editor.selection.active;

        let pkg = "";
        // 使用预编译正则
        const pkgMatch = fullText.match(PACKAGE_REGEX);
        if (pkgMatch) pkg = pkgMatch[1];

        let className = "";
        let methodName = "";
        let classPath = "";
        let methodPath = "";

        // 使用预编译正则 - 首先尝试 Spring @RequestMapping
        let classMappingMatch = fullText.match(CLASS_MAPPING_REGEX);
        if (classMappingMatch) classPath = classMappingMatch[1];

        // 如果没找到 Spring 风格，尝试 JAX-RS @Path（类级别）
        if (!classPath) {
            const jaxRsPathMatch = fullText.match(/@Path\s*\(\s*"([^"]+)"\s*\)/);
            if (jaxRsPathMatch) classPath = jaxRsPathMatch[1];
        }

        if (symbols && Array.isArray(symbols)) {
            function findDetails(list) {
                for (const s of list) {
                    if (s.range.contains(pos)) {
                        // 使用 Set.has() 替代数组 includes()
                        if (CLASS_KINDS.has(s.kind)) {
                            className = pkg ? `${pkg}.${s.name}` : s.name;
                        }
                        if (s.kind === 5 || s.kind === 8) {
                            methodName = s.name;
                            // 移除方法签名中的参数部分，只保留方法名
                            if (methodName && methodName.includes('(')) {
                                methodName = methodName.split('(')[0].trim();
                            }
                            const methodRangeText = document.getText(s.range);
                            // 使用预编译正则
                            const mMatch = methodRangeText.match(METHOD_MAPPING_REGEX);
                            if (mMatch) methodPath = mMatch[1];
                        }
                        if (s.children && s.children.length > 0) findDetails(s.children);
                        return;
                    }
                }
            }
            findDetails(symbols);
        }

        if (!className) {
            // 使用工具函数
            className = extractClassNameFromFile(document.fileName);
        }

        // 改进降级方案：处理两种情况
        // 情况1：如果已有 methodName 但没有 methodPath，说明 Symbol Provider 找到了方法，向上查找装饰器
        // 情况2：如果两者都没有，向下后向上查找装饰器

        const cursorLine = pos.line;

        if (!methodPath && methodName) {
            // 向上查找该方法的装饰器（最多查找10行）
            // 支持三种风格：Spring @RequestMapping、JAX-RS @Path/@Post/@Get 等、Feign @RequestMapping
            for (let i = cursorLine - 1; i >= Math.max(0, cursorLine - 10); i--) {
                const line = document.lineAt(i).text;

                // Spring 风格：@RequestMapping、@PostMapping、@GetMapping 等
                let decoratorMatch = line.match(/@(?:Post|Get|Put|Delete|Patch|Request)Mapping\s*\(\s*(?:(?:value|path)\s*=\s*)?"([^"]+)"/);
                if (decoratorMatch) {
                    methodPath = decoratorMatch[1];
                    break;
                }

                // JAX-RS 风格：@Path("...")
                decoratorMatch = line.match(/@Path\s*\(\s*"([^"]+)"\s*\)/);
                if (decoratorMatch) {
                    methodPath = decoratorMatch[1];
                    break;
                }
            }
        } else if (!methodPath && !methodName) {
            // 都没找到，则向下后向上查找装饰器
            const cursorLine = pos.line;
            let foundDecoratorLine = -1;

            // 先向下查找（5行内）最近的装饰器
            for (let i = cursorLine; i <= Math.min(document.lineCount - 1, cursorLine + 5); i++) {
                const line = document.lineAt(i).text;

                // Spring 风格：@RequestMapping、@PostMapping、@GetMapping 等
                let decoratorMatch = line.match(/@(?:Post|Get|Put|Delete|Patch|Request)Mapping\s*\(\s*(?:(?:value|path)\s*=\s*)?"([^"]+)"/);
                if (decoratorMatch) {
                    methodPath = decoratorMatch[1];
                    foundDecoratorLine = i;
                    break;
                }

                // JAX-RS 风格：@Path("...")
                decoratorMatch = line.match(/@Path\s*\(\s*"([^"]+)"\s*\)/);
                if (decoratorMatch) {
                    methodPath = decoratorMatch[1];
                    foundDecoratorLine = i;
                    break;
                }
            }

            // 如果向下没找到，再向上查找（5行内）
            if (foundDecoratorLine === -1) {
                for (let i = cursorLine - 1; i >= Math.max(0, cursorLine - 5); i--) {
                    const line = document.lineAt(i).text;

                    // Spring 风格：@RequestMapping、@PostMapping、@GetMapping 等
                    let decoratorMatch = line.match(/@(?:Post|Get|Put|Delete|Patch|Request)Mapping\s*\(\s*(?:(?:value|path)\s*=\s*)?"([^"]+)"/);
                    if (decoratorMatch) {
                        methodPath = decoratorMatch[1];
                        foundDecoratorLine = i;
                        break;
                    }

                    // JAX-RS 风格：@Path("...")
                    decoratorMatch = line.match(/@Path\s*\(\s*"([^"]+)"\s*\)/);
                    if (decoratorMatch) {
                        methodPath = decoratorMatch[1];
                        foundDecoratorLine = i;
                        break;
                    }
                }
            }

            // 如果找到了装饰器，查找其后的方法声明
            if (foundDecoratorLine !== -1 && !methodName) {
                for (let j = foundDecoratorLine + 1; j <= Math.min(document.lineCount - 1, foundDecoratorLine + 5); j++) {
                    const methodLine = document.lineAt(j).text;
                    const methodMatch = methodLine.match(/(?:public|private|protected)?\s*(?:static)?\s*(?:synchronized)?\s*[\w<>.*]+\s+(\w+)\s*\(/);
                    if (methodMatch) {
                        methodName = methodMatch[1];
                        break;
                    }
                }
            }
        }

        const clean = (p) => p ? p.replace(/^\/*|\/*$/g, '') : '';
        const cPart = clean(classPath);
        const mPart = clean(methodPath);
        const restPath = `/${[cPart, mPart].filter(Boolean).join('/')}`;

        const result = { className, methodName, pkg, restPath };

        return result;
    }

    // [功能 1] 复制 Java 引用路径
    let copyRef = vscode.commands.registerCommand('advCopy.copyReference', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;
        const { className, methodName } = await getJavaSymbols(editor);
        const result = methodName ? `${className}#${methodName}` : className;
        await vscode.env.clipboard.writeText(result);
        vscode.window.showInformationMessage(`✅ 已复制引用路径: ${result}`);
    });

    // [功能 2] 复制 Arthas Vmtool 命令（支持多参数，二次弹窗输入，支持中文转ASCII）
    let copyVmtool = vscode.commands.registerCommand('advCopy.copyVmtool', async () => {
        try {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showErrorMessage('❌ 未打开编辑器');
                return;
            }

            // 快速获取类名（不使用耗时的 getJavaSymbols）
            const fullText = editor.document.getText();
            const pkgMatch = fullText.match(/package\s+([\w.]+)\s*;/);
            const pkgName = pkgMatch ? pkgMatch[1] : '';

            const classMatch = fullText.match(/(?:public\s+)?(?:class|interface)\s+(\w+)/);
            const className = classMatch ? classMatch[1] : '';

            const fullClassName = pkgName && className ? `${pkgName}.${className}` : className;

            if (!fullClassName) {
                vscode.window.showErrorMessage('❌ 未检测到类名');
                return;
            }

            const cursorLine = editor.selection.active.line;

            // 获取完整的方法签名（可能跨越多行）
            let methodSignatureText = '';
            let methodName = '';
            let paramContent = '';

            // 先尝试从光标行往下查找完整方法签名
            const startLine = Math.max(0, cursorLine - 2);
            const endLine = Math.min(editor.document.lineCount - 1, cursorLine + 10);

            for (let lineNum = startLine; lineNum <= endLine; lineNum++) {
                const line = editor.document.lineAt(lineNum).text.trim();
                methodSignatureText += ' ' + line;

                // 尝试匹配方法签名：方法名(参数)
                const methodParamRegex = /(\w+)\s*\(([^)]*)\)/;
                const match = methodSignatureText.match(methodParamRegex);

                if (match) {
                    methodName = match[1];
                    paramContent = match[2].trim();
                    // 检查是否找到了完整的参数列表（包含右括号）
                    if (methodSignatureText.includes(')')) {
                        break;
                    }
                }
            }

            if (!methodName || !paramContent) {
                vscode.window.showErrorMessage('❌ 未检测到方法签名，请确保光标在方法声明行附近');
                return;
            }

            let command = "";

            if (!paramContent) {
                // 无参数
                const express = `instances[0].${methodName}()`;
                command = `vmtool -x 3 --action getInstances --className ${fullClassName} --express '${express}'`;
            } else {
                // 解析参数列表，处理多参数情况
                const params = [];
                let currentParam = '';
                let angleDepth = 0;
                let parenDepth = 0;

                // 正确处理泛型参数（如 List<String>）和嵌套括号
                for (let i = 0; i < paramContent.length; i++) {
                    const char = paramContent[i];

                    if (char === '<') angleDepth++;
                    else if (char === '>') angleDepth--;
                    else if (char === '(') parenDepth++;
                    else if (char === ')') parenDepth--;
                    else if (char === ',' && angleDepth === 0 && parenDepth === 0) {
                        if (currentParam.trim()) {
                            params.push(currentParam.trim());
                        }
                        currentParam = '';
                        continue;
                    }
                    currentParam += char;
                }
                if (currentParam.trim()) {
                    params.push(currentParam.trim());
                }

                if (params.length === 0) {
                    vscode.window.showErrorMessage('❌ 无法解析参数列表');
                    return;
                }

                // 解析每个参数的类型和名称
                const parsedParams = params.map(p => {
                    const trimmed = p.trim();
                    const parts = trimmed.split(/\s+/);
                    const paramName = parts[parts.length - 1];
                    const paramType = parts.slice(0, -1).join(' ').trim();
                    return { type: paramType, name: paramName };
                });

                // 为对象参数尝试生成默认JSON
                const generateDefaultJson = (paramType) => {
                    // 提取类名（处理泛型）
                    const typeNameMatch = paramType.match(/([A-Z]\w+)/);
                    if (!typeNameMatch) return '{}';

                    const typeName = typeNameMatch[1];

                    // 在文本中查找这个类的定义并提取字段
                    const classRegex = new RegExp(`(?:class|interface)\\s+${typeName}\\s*[{<]`);
                    const classMatch = fullText.match(classRegex);

                    if (!classMatch) {
                        return '{}';
                    }

                    const classStart = classMatch.index + classMatch[0].length;
                    const classText = fullText.substring(classStart);

                    // 提取字段定义（简单正则，查找 private/public 字段）
                    const fieldRegex = getFieldRegex();
                    const fields = {};
                    let fieldMatch;

                    let fieldCount = 0;
                    while ((fieldMatch = fieldRegex.exec(classText)) && fieldCount < 50) {
                        const fieldType = fieldMatch[1].toLowerCase();
                        const fieldName = fieldMatch[2];

                        // 忽略序列化相关字段
                        if (fieldName === 'serialVersionUID') continue;

                        // 根据字段类型设置默认值
                        if (fieldType.includes('string') || fieldType.includes('char')) {
                            fields[fieldName] = ' ';
                        } else if (fieldType.includes('integer') || fieldType.includes('int') ||
                                   fieldType.includes('long') || fieldType.includes('byte') ||
                                   fieldType.includes('short')) {
                            fields[fieldName] = 0;
                        } else if (fieldType.includes('double') || fieldType.includes('float')) {
                            fields[fieldName] = 1;
                        } else if (fieldType.includes('boolean')) {
                            fields[fieldName] = false;
                        } else if (fieldType.includes('date') || fieldType.includes('time')) {
                            fields[fieldName] = Date.now();
                        } else if (fieldType.includes('list') || fieldType.includes('set')) {
                            fields[fieldName] = [];
                        } else if (fieldType.includes('map')) {
                            fields[fieldName] = {};
                        } else {
                            fields[fieldName] = null;
                        }

                        fieldCount++;
                    }

                    return Object.keys(fields).length > 0 ? JSON.stringify(fields) : '{}';
                };

                // 获取完整的类名（包含包名）
                const getFullClassName = (paramType) => {
                    // 如果参数类型已经包含包名，直接返回
                    if (paramType.includes('.')) {
                        return paramType;
                    }

                    // 提取类名（处理泛型）
                    const typeNameMatch = paramType.match(/([A-Z]\w+)/);
                    if (!typeNameMatch) return paramType;

                    const typeName = typeNameMatch[1];

                    // 查找导入语句
                    const importRegex = new RegExp(`import\\s+([\\w.]*\\.${typeName});`);
                    const importMatch = fullText.match(importRegex);

                    if (importMatch) {
                        return importMatch[1];
                    }

                    // 如果是同包的类，使用当前包名+类名
                    if (pkgName) {
                        return `${pkgName}.${typeName}`;
                    }

                    return typeName;
                };

                // 为每个参数弹窗输入值
                const paramValues = [];
                let cancelled = false;

                for (let i = 0; i < parsedParams.length; i++) {
                    const param = parsedParams[i];
                    const typeStr = param.type.toLowerCase();

                    let defaultValue = '';
                    let isObjectType = false;

                    // 判断是否为对象参数
                    if (!typeStr.includes('string') &&
                        !typeStr.includes('integer') &&
                        !typeStr.includes('int') &&
                        !typeStr.includes('long') &&
                        !typeStr.includes('double') &&
                        !typeStr.includes('float') &&
                        !typeStr.includes('boolean') &&
                        !typeStr.includes('list') &&
                        !typeStr.includes('byte') &&
                        !typeStr.includes('short')) {
                        isObjectType = true;
                        // 为对象参数生成默认值：空JSON
                        const fullParamType = getFullClassName(param.type);
                        // 使用空JSON作为默认值
                        defaultValue = `@com.alibaba.fastjson.JSON@parseObject("{}",@${fullParamType}@class)`;
                    }

                    // 显示弹窗
                    const userInput = await vscode.window.showInputBox({
                        title: `输入参数 ${i + 1}/${parsedParams.length}`,
                        placeHolder: `参数名: ${param.name} | 类型: ${param.type}`,
                        value: defaultValue,
                        prompt: isObjectType ? '修改JSON或整个表达式，然后按 Enter 确认' : '输入参数值，支持中文自动转ASCII，然后按 Enter 确认',
                        ignoreFocusOut: true,
                        validateInput: (input) => {
                            // 不做验证，让用户输入任何内容
                            return null;
                        }
                    });

                    console.log(`参数 ${i + 1} 用户输入:`, userInput);

                    if (userInput === undefined || userInput === null) {
                        // 用户取消了输入
                        cancelled = true;
                        console.log(`用户取消了参数 ${i + 1} 的输入`);
                        break;
                    }

                    let value = userInput.trim();

                    // 根据参数类型判断是否需要加引号
                    let finalValue = '';

                    if (typeStr.includes('string')) {
                        // String 类型必须加引号
                        // 如果输入有中文，转ASCII
                        if (value) {
                            value = escapeChineseForJava(value);
                        }
                        finalValue = `"${value}"`;
                    } else if (typeStr.includes('integer') ||
                               typeStr.includes('int') ||
                               typeStr.includes('long') ||
                               typeStr.includes('double') ||
                               typeStr.includes('float') ||
                               typeStr.includes('byte') ||
                               typeStr.includes('short')) {
                        // 数值类型不加引号，如果为空则使用 0
                        finalValue = value || '0';
                    } else if (typeStr.includes('boolean')) {
                        // 布尔类型，如果为空则使用 false
                        finalValue = value || 'false';
                    } else if (typeStr.includes('list')) {
                        // List 类型，使用集合格式
                        finalValue = `{${value ? `"${value}"` : ''}}`;
                    } else {
                        // 对象参数 - 用户输入应该已经是完整的表达式或JSON
                        // 如果用户修改了默认值，直接使用；否则使用默认值
                        finalValue = value || defaultValue;
                    }

                    console.log(`参数 ${i + 1} 最终值:`, finalValue);
                    paramValues.push(finalValue);
                }

                if (cancelled) {
                    console.log('用户取消了复制');
                    return;
                }

                const express = `instances[0].${methodName}(${paramValues.join(', ')})`;
                command = `vmtool -x 3 --action getInstances --className ${fullClassName} --express '${express}'`;
            }

            await vscode.env.clipboard.writeText(command);
            vscode.window.showInformationMessage(`✅ Vmtool 命令已复制`);
        } catch (error) {
            vscode.window.showErrorMessage(`❌ 错误: ${error.message}`);
            console.error('copyVmtool error:', error);
        }
    });
    // [功能 4] 复制 REST 完整路径
    let copyRestPath = vscode.commands.registerCommand('advCopy.copyRestPath', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;
        const { restPath } = await getJavaSymbols(editor);
        if (restPath === "/") {
        vscode.window.showErrorMessage("❌ 未检测到 Mapping 注解路径");
            return;
        }
        await vscode.env.clipboard.writeText(restPath);
        vscode.window.showInformationMessage(`✅ REST 路径已复制: ${restPath}`);
    });

// [功能 5] 究极版纯文本处理：识别并反解 Java 拼接/转义字符串
// [功能 5] 智能净化器：自动识别 JSON 或普通字符串
let copyPlain = vscode.commands.registerCommand('advCopy.copyPlainText', async () => {
    const editor = vscode.window.activeTextEditor;
    if (editor) {
        let selectionText = editor.document.getText(editor.selection);
        if (!selectionText) return;

        // --- 1. 提取阶段 ---
        let targetText = "";
        const quoteRegex = /"(\\.|[^"\\])*"/g;
        let matches = selectionText.match(quoteRegex);

        if (matches && matches.length > 0) {
            targetText = matches.map(m => m.slice(1, -1)).join('');
        } else {
            targetText = selectionText;
        }

        // --- 2. 反转义（使用工具函数）---
        let decoded = unescapeJavaString(targetText);

        // --- 3. 深度识别与格式化 ---
        let finalResult = decoded.trim();

        if (/^[\{\[]/.test(finalResult)) {
            try {
                const jsonObj = JSON.parse(finalResult);
                finalResult = JSON.stringify(jsonObj, null, 2);
            } catch (e) {
                try {
                    const secondaryDecoded = unescapeJavaString(finalResult);
                    const jsonObj = JSON.parse(secondaryDecoded);
                    finalResult = JSON.stringify(jsonObj, null, 2);
                } catch (e2) {
                    // 保持原样
                }
            }
        }

        // --- 4. 写入剪贴板 ---
        await vscode.env.clipboard.writeText(finalResult);
        vscode.window.showInformationMessage(
            finalResult.startsWith('{') || finalResult.startsWith('[')
            ? "✨ 已识别并净化为 JSON 格式"
            : "📝 已净化为纯净字符串"
        );
    }
});

// [功能 6] 智能感知粘贴：自动识别引号环境
let pastePlain = vscode.commands.registerCommand('advCopy.pastePlainText', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const document = editor.document;
    const selection = editor.selection;

    let text = await vscode.env.clipboard.readText();
    if (!text) return;

    // --- 智能感知逻辑：检测光标前后是否已经是引号 ---
    let needsOuterQuotes = true;

    // 获取光标前后的字符位置
    if (selection.isEmpty) {
        const cursorRoot = selection.active;
        if (cursorRoot.character > 0 && cursorRoot.character < document.lineAt(cursorRoot.line).text.length) {
            const charBefore = document.getText(new vscode.Range(cursorRoot.translate(0, -1), cursorRoot));
            const charAfter = document.getText(new vscode.Range(cursorRoot, cursorRoot.translate(0, 1)));

            // 如果光标被双引号包围 (e.g. "|")，则不生成外层引号
            if (charBefore === '"' && charAfter === '"') {
                needsOuterQuotes = false;
            }
        }
    }

    // --- 数据清洗与转义 ---
    // 1. 自动剥离首尾括号（针对 SQL 场景）
    if (text.trim().startsWith('(') && text.trim().endsWith(')')) {
        text = text.trim().replace(/^\(|\)$/g, '');
    }

    const lines = text.split(/\r?\n/);
    let finalPaste = "";

    if (lines.length > 1) {
        // 多行模式：Java 拼接格式
        finalPaste = lines.map((line, index) => {
            // 使用工具函数进行转义
            const escapedLine = escapeJavaString(line);
            const isLast = index === lines.length - 1;

            // 如果已经在引号内，第一行开头和最后一行结尾不带引号
            const startQuote = (index === 0 && !needsOuterQuotes) ? "" : '"';
            const endQuote = (isLast && !needsOuterQuotes) ? "" : '"';
            const suffix = isLast ? "" : " +";

            return `${startQuote}${escapedLine}\\n${endQuote}${suffix}`;
        }).join('\n');
    } else {
        // 单行模式
        // 使用工具函数进行转义
        const escapedText = escapeJavaString(text);
        finalPaste = needsOuterQuotes ? `"${escapedText}"` : escapedText;
    }

    editor.edit(editBuilder => {
        editBuilder.replace(selection, finalPaste);
    });
});

    
let copyAsJson = vscode.commands.registerCommand('advCopy.copyAsBean', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const { document, selection } = editor;
    const symbols = await vscode.commands.executeCommand('vscode.executeDocumentSymbolProvider', document.uri);

    let mockObj = {};
    const isSelectionEmpty = selection.isEmpty;

    // 优先使用符号提供者
    if (symbols && symbols.length > 0) {
        const { classes: allClasses, fields: allFields } = collectSymbols(symbols);

        // 核心匹配逻辑
        if (isSelectionEmpty) {
            const pos = selection.active;
            // 优先判断是否点在某个字段上
            const targetField = allFields.find(f => f.range.contains(pos));
            if (targetField) {
                // 只复制这个字段（过滤static和final）
                const fieldLine = document.lineAt(targetField.range.start.line);
                if (!isStaticOrFinalField(fieldLine.text)) {
                    mockObj[targetField.name] = getMagicValue(getFieldType(targetField, document));
                }
            } else {
                // 如果没点在字段上，看是否点在类名/类范围内
                let targetClass = allClasses.find(c => c.range.contains(pos));

                // 如果没找到，检查光标是否在某个类的声明行上（处理光标在类名上的情况）
                if (!targetClass) {
                    const cursorLine = pos.line;
                    targetClass = allClasses.find(c => c.range.start.line === cursorLine);
                }

                if (targetClass) {
                    // 提取该类下的所有字段（过滤static和final）
                    allFields.forEach(f => {
                        if (targetClass.range.contains(f.range.start)) {
                            const fieldLine = document.lineAt(f.range.start.line);
                            if (!isStaticOrFinalField(fieldLine.text)) {
                                mockObj[f.name] = getMagicValue(getFieldType(f, document));
                            }
                        }
                    });
                } else {
                    // 如果点不在任何类上，尝试使用所有字段（过滤static和final）
                    allFields.forEach(f => {
                        const fieldLine = document.lineAt(f.range.start.line);
                        if (!isStaticOrFinalField(fieldLine.text)) {
                            mockObj[f.name] = getMagicValue(getFieldType(f, document));
                        }
                    });
                }
            }
        } else {
            // 划选模式：物理行判定，尝试找选中的字段（过滤static和final）
            const selectedFields = [];
            allFields.forEach(f => {
                const fieldLine = f.range.start.line;
                if (fieldLine >= selection.start.line && fieldLine <= selection.end.line) {
                    const fieldText = document.lineAt(fieldLine).text;
                    if (!isStaticOrFinalField(fieldText)) {
                        selectedFields.push(f);
                        mockObj[f.name] = getMagicValue(getFieldType(f, document));
                    }
                }
            });

            // 如果划选没有找到任何字段，兜底为整个类的所有字段（过滤static和final）
            if (selectedFields.length === 0) {
                allFields.forEach(f => {
                    const fieldLine = document.lineAt(f.range.start.line);
                    if (!isStaticOrFinalField(fieldLine.text)) {
                        mockObj[f.name] = getMagicValue(getFieldType(f, document));
                    }
                });
            }
        }
    }

    // 降级方案：如果 symbols 失败或没有找到字段，从文本中提取
    if (Object.keys(mockObj).length === 0) {
        const fullText = document.getText();
        const lines = fullText.split('\n');
        const cursorLine = selection.active.line;

        // 向上查找类定义
        let classLine = -1;
        for (let i = cursorLine; i >= Math.max(0, cursorLine - 50); i--) {
            if (/(?:public\s+)?(?:class|interface)\s+(\w+)/.test(lines[i])) {
                classLine = i;
                break;
            }
        }

        // 如果找到了类，从中提取字段
        if (classLine >= 0) {
            const classStartPos = document.offsetAt(new vscode.Position(classLine, 0));
            let classEndPos = fullText.length;

            // 找到类的结束位置（下一个类的开始或文件结束）
            for (let i = classLine + 1; i < lines.length; i++) {
                if (/(?:public\s+)?(?:class|interface)\s+(\w+)/.test(lines[i])) {
                    classEndPos = document.offsetAt(new vscode.Position(i, 0));
                    break;
                }
            }

            const classText = fullText.substring(classStartPos, classEndPos);

            if (isSelectionEmpty) {
                const pos = selection.active;
                const posInClass = document.offsetAt(pos) - classStartPos;

                // 查找光标位置所在的字段
                const fieldRegex = getFieldRegex();
                let fieldFound = false;
                let match;

                while ((match = fieldRegex.exec(classText)) !== null) {
                    const fieldName = match[2];
                    const fieldStart = match.index;
                    const fieldEnd = match.index + match[0].length;

                    // 检查光标是否在这个字段内
                    if (posInClass >= fieldStart && posInClass <= fieldEnd) {
                        // 过滤掉 static 和 final 字段
                        if (!isStaticOrFinalField(match[0])) {
                            const fieldType = match[1].toLowerCase();
                            if (fieldName !== 'serialVersionUID') {
                                mockObj[fieldName] = getMagicValue(fieldType);
                                fieldFound = true;
                                break;
                            }
                        }
                    }
                }

                // 如果没有找到字段，提取整个类的所有字段（兜底）
                if (!fieldFound) {
                    const fieldRegex2 = getFieldRegex();
                    let m;
                    while ((m = fieldRegex2.exec(classText)) !== null) {
                        const fieldType = m[1].toLowerCase();
                        const fieldName = m[2];
                        // 过滤掉 static 和 final 字段
                        if (!isStaticOrFinalField(m[0]) && fieldName !== 'serialVersionUID') {
                            mockObj[fieldName] = getMagicValue(fieldType);
                        }
                    }
                }
            } else {
                // 划选模式：首先尝试找选中范围的字段
                const fieldRegex = getFieldRegex();
                let match;
                let selectedCount = 0;

                while ((match = fieldRegex.exec(classText)) !== null) {
                    const fieldName = match[2];
                    const fieldStart = match.index;
                    const fieldEnd = match.index + match[0].length;

                    if (fieldName !== 'serialVersionUID' && !isStaticOrFinalField(match[0])) {
                        const selectionStartOffset = document.offsetAt(selection.start);
                        const selectionEndOffset = document.offsetAt(selection.end);
                        const selectionStartInClass = selectionStartOffset - classStartPos;
                        const selectionEndInClass = selectionEndOffset - classStartPos;

                        if (fieldStart >= selectionStartInClass && fieldEnd <= selectionEndInClass) {
                            const fieldType = match[1].toLowerCase();
                            mockObj[fieldName] = getMagicValue(fieldType);
                            selectedCount++;
                        }
                    }
                }

                // 如果划选没有找到任何字段，兜底为整个类的所有字段
                if (selectedCount === 0) {
                    const fieldRegex2 = getFieldRegex();
                    let m;
                    while ((m = fieldRegex2.exec(classText)) !== null) {
                        const fieldName = m[2];
                        const fieldType = m[1].toLowerCase();
                        // 过滤掉 static 和 final 字段
                        if (!isStaticOrFinalField(m[0]) && fieldName !== 'serialVersionUID') {
                            mockObj[fieldName] = getMagicValue(fieldType);
                        }
                    }
                }
            }
        }
    }

    if (Object.keys(mockObj).length > 0) {
        await vscode.env.clipboard.writeText(JSON.stringify(mockObj, null, 2));
        vscode.window.showInformationMessage(`✅ 已生成 ${Object.keys(mockObj).length} 个字段的 JSON`);
    } else {
        vscode.window.showErrorMessage('❌ 未找到任何字段');
    }
});

    // [功能 7] 复制 Arthas tt 命令
    let copyTimeTunnel = vscode.commands.registerCommand('advCopy.copyTimeTunnel', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;
        const { className, methodName: rawMethodName } = await getJavaSymbols(editor);
        if (!rawMethodName) {
        vscode.window.showErrorMessage("❌ 未在光标处观测到有效方法名");
            return;
        }
        const methodName = rawMethodName.split('(')[0].trim();
        const command = `tt -t ${className} ${methodName} -n 5`;
        await vscode.env.clipboard.writeText(command);
        vscode.window.showInformationMessage(`✅ Arthas tt 命令已捕捉: ${methodName}`);
    });

let copySql = vscode.commands.registerCommand('advCopy.copySqlSelect', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const { document, selection } = editor;
    const symbols = await vscode.commands.executeCommand('vscode.executeDocumentSymbolProvider', document.uri);

    let columns = [];
    let tableName = "";
    const isSelectionEmpty = selection.isEmpty;
    let foundClass = false;
    let useWildcard = false;  // 标记是否需要用 * 兜底

    // 优先使用符号提供者
    if (symbols && symbols.length > 0) {
        const { classes: allClasses, fields: allFields } = collectSymbols(symbols);

        if (isSelectionEmpty) {
            const pos = selection.active;
            const targetField = allFields.find(f => f.range.contains(pos));
            let targetClass = allClasses.find(c => c.range.contains(pos));

            // 如果没找到，检查光标是否在某个类的声明行上（处理光标在类名上的情况）
            if (!targetClass) {
                const cursorLine = pos.line;
                targetClass = allClasses.find(c => c.range.start.line === cursorLine);
            }

            if (targetField) {
                // 只复制这个字段，同时需要获取表名（过滤static和final）
                const fieldLine = document.lineAt(targetField.range.start.line);
                if (!isStaticOrFinalField(fieldLine.text)) {
                    columns.push(toSnakeCase(targetField.name));
                }
                // 尝试找到包含这个字段的类
                const fieldClass = allClasses.find(c => c.range.contains(targetField.range.start));
                if (fieldClass) {
                    const rawName = fieldClass.name.includes('.') ? fieldClass.name.split('.').pop() : fieldClass.name;
                    tableName = cleanTableName(rawName);
                    foundClass = true;
                }
            } else if (targetClass) {
                const rawName = targetClass.name.includes('.') ? targetClass.name.split('.').pop() : targetClass.name;
                tableName = cleanTableName(rawName);
                foundClass = true;
                // 提取该类下的所有字段（过滤static和final和复杂类型）
                allFields.forEach(f => {
                    if (targetClass.range.contains(f.range.start)) {
                        const fieldLine = document.lineAt(f.range.start.line);
                        if (!isStaticOrFinalField(fieldLine.text)) {
                            const fieldType = getFieldType(f, document);
                            // 只排除明显的复杂类型（List、Map、Set、Stream、Optional等）
                            if (fieldType && !isComplexType(fieldType)) {
                                columns.push(toSnakeCase(f.name));
                            }
                        }
                    }
                });
                // 如果没有找到任何字段，使用通配符
                if (columns.length === 0) {
                    useWildcard = true;
                }
            } else {
                // 如果找不到 targetClass，尝试从所有字段中提取（兜底方案）
                // 这可以解决 Symbol 提供者在某些情况下无法识别类的问题
                allFields.forEach(f => {
                    const fieldLine = document.lineAt(f.range.start.line);
                    const fieldType = getFieldType(f, document);
                    if (!isStaticOrFinalField(fieldLine.text) &&
                        fieldType && !isComplexType(fieldType)) {
                        columns.push(toSnakeCase(f.name));
                    }
                });
            }
        } else {
            // 划选模式：只复制选中的字段（过滤static和final）
            const selectedFields = [];
            allFields.forEach(f => {
                const fieldLine = f.range.start.line;
                if (fieldLine >= selection.start.line && fieldLine <= selection.end.line) {
                    const fieldText = document.lineAt(fieldLine).text;
                    if (!isStaticOrFinalField(fieldText)) {
                        const fieldType = getFieldType(f, document);
                        // 只排除明显的复杂类型（List、Map、Set、Stream、Optional等）
                        if (fieldType && !isComplexType(fieldType)) {
                            columns.push(toSnakeCase(f.name));
                            selectedFields.push(f);
                        }
                    }
                }
            });

            // 如果划选没有找到任何字段，兜底为 *
            if (selectedFields.length === 0) {
                useWildcard = true;
            }

            // 尝试找选区所在的类作为表名
            const parentClass = allClasses.find(c => c.range.contains(selection.start));
            if (parentClass) {
                tableName = cleanTableName(parentClass.name.split('.').pop());
                foundClass = true;
            }
        }
    }

    // 降级方案：只有在 Symbol 提供者完全失败或没有找到字段时才进入
    // 关键修复：即使找到类，如果没有字段也应该进行文本匹配补救
    if (!foundClass || !tableName || columns.length === 0) {
        // 如果符号提供者找到了类但没有字段，清空 columns 防止混合结果
        if (columns.length === 0) {
            columns = [];
            useWildcard = false;
        }

        const fullText = document.getText();
        const lines = fullText.split('\n');
        const cursorLine = selection.active.line;

        // 向上查找类定义
        let classLine = -1;
        for (let i = cursorLine; i >= Math.max(0, cursorLine - 50); i--) {
            if (/(?:public\s+)?(?:class|interface)\s+(\w+)/.test(lines[i])) {
                classLine = i;
                break;
            }
        }

        // 如果找到了类定义，从中提取类名和字段
        if (classLine >= 0) {
            const classMatch = lines[classLine].match(/(?:public\s+)?(?:class|interface)\s+(\w+)/);
            if (classMatch) {
                const className = classMatch[1];
                tableName = cleanTableName(className);
                foundClass = true;
            }

            const classStartPos = document.offsetAt(new vscode.Position(classLine, 0));
            let classEndPos = fullText.length;

            // 找到类的结束位置
            for (let i = classLine + 1; i < lines.length; i++) {
                if (/(?:public\s+)?(?:class|interface)\s+(\w+)/.test(lines[i])) {
                    classEndPos = document.offsetAt(new vscode.Position(i, 0));
                    break;
                }
            }

            const classText = fullText.substring(classStartPos, classEndPos);

            if (isSelectionEmpty) {
                const pos = selection.active;
                const posInClass = document.offsetAt(pos) - classStartPos;

                // 查找光标位置所在的字段
                const fieldRegex = getFieldRegex();
                let fieldFound = false;
                let match;

                while ((match = fieldRegex.exec(classText)) !== null) {
                    const fieldName = match[2];
                    const fieldType = match[1].toLowerCase();
                    const fieldStart = match.index;
                    const fieldEnd = match.index + match[0].length;

                    // 检查光标是否在这个字段内
                    if (posInClass >= fieldStart && posInClass <= fieldEnd && fieldName !== 'serialVersionUID') {
                        // 过滤掉 static 和 final 字段
                        if (!isStaticOrFinalField(match[0])) {
                            // 排除复杂集合类型（List、Map、Set、Stream、Optional等）
                            if (!isComplexType(fieldType)) {
                                columns.push(toSnakeCase(fieldName));
                            }
                        }
                        fieldFound = true;
                        break;
                    }
                }

                // 如果没有找到字段，提取整个类的所有非复杂类型字段
                if (!fieldFound) {
                    const fieldRegex2 = getFieldRegex();
                    let m;
                    while ((m = fieldRegex2.exec(classText)) !== null) {
                        const fieldName = m[2];
                        const fieldType = m[1].toLowerCase();
                        // 过滤掉 static、final 和复杂集合类型字段
                        if (fieldName === 'serialVersionUID' || isStaticOrFinalField(m[0])) continue;
                        if (isComplexType(fieldType)) continue;

                        columns.push(toSnakeCase(fieldName));
                    }

                    // 如果仍然没有找到任何字段，标记为使用通配符
                    if (columns.length === 0) {
                        useWildcard = true;
                    }
                }
            } else {
                // 划选模式：只复制选中范围内的基础类型字段
                const selectionStartOffset = document.offsetAt(selection.start);
                const selectionEndOffset = document.offsetAt(selection.end);
                const selectionStartInClass = selectionStartOffset - classStartPos;
                const selectionEndInClass = selectionEndOffset - classStartPos;

                const fieldRegex = getFieldRegex();
                let match;
                let selectedCount = 0;

                while ((match = fieldRegex.exec(classText)) !== null) {
                    const fieldName = match[2];
                    const fieldType = match[1].toLowerCase();
                    const fieldStart = match.index;
                    const fieldEnd = match.index + match[0].length;

                    if (fieldName !== 'serialVersionUID' && !isStaticOrFinalField(match[0]) && fieldStart >= selectionStartInClass && fieldEnd <= selectionEndInClass) {
                        // 排除复杂集合类型（List、Map、Set、Stream、Optional等）
                        if (!isComplexType(fieldType)) {
                            columns.push(toSnakeCase(fieldName));
                            selectedCount++;
                        }
                    }
                }

                // 如果划选没有找到任何字段，兜底为 *
                if (selectedCount === 0) {
                    useWildcard = true;
                }
            }
        }
    }

    // 构建 SQL
    if (!tableName) {
        tableName = cleanTableName(path.basename(document.fileName, '.java'));
    }

    if (columns.length > 0) {
        const sql = `SELECT ${[...new Set(columns)].join(', ')} FROM ${tableName};`;
        await vscode.env.clipboard.writeText(sql);
        vscode.window.showInformationMessage(`✅ SQL 已生成 (${columns.length} 字段，表名: ${tableName})`);
    } else if (useWildcard && tableName) {
        // 使用 * 兜底
        const sql = `SELECT * FROM ${tableName};`;
        await vscode.env.clipboard.writeText(sql);
        vscode.window.showInformationMessage(`✅ SQL 已生成 (使用 *，表名: ${tableName})`);
    } else {
        vscode.window.showErrorMessage('❌ 未找到任何字段');
    }
});

    // [功能 8] Arthas 命令快速选择菜单
    let arthCommand = vscode.commands.registerCommand('advCopy.arthQuickMenu', async () => {
        await showArthasQuickPick();
    });

    // [功能 9] 按 REST 路径导航到 Controller
    let navigateToController = vscode.commands.registerCommand('advCopy.navigateToController', async () => {
        try {
            // ⚠️ 检查工作区是否已切换，如果切换则刷新缓存
            checkAndSwitchWorkspace();

            // 1. 从剪贴板读取默认值
            const clipboardText = await vscode.env.clipboard.readText();

            // 2. 显示输入框（带剪贴板默认值）
            const userInput = await vscode.window.showInputBox({
                placeHolder: '输入 REST 路径或完整 URL（如 /api/user/list 或 http://api.example.com:8080/api/user/list）',
                value: clipboardText && clipboardText.trim().startsWith('/') ? clipboardText.trim() : '',
                prompt: '粘贴 REST API 路径或 URL，自动提取并查找对应的 Controller'
            });

            // 用户取消输入
            if (!userInput) return;

            // 3. 解析输入（支持 URL）
            const parseResult = parseRestPathFromInput(userInput);

            if (!parseResult.isValid) {
                vscode.window.showErrorMessage(`❌ ${parseResult.error}`);
                return;
            }

            const inputPath = parseResult.path;
            const matchType = parseResult.matchType || 'path';

            // 4. 工作区检查
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                vscode.window.showErrorMessage('❌ 请在打开的工作区中使用此功能');
                return;
            }

            // 5. 判断缓存是否有效（基于初始化状态和时间）
            const isCacheValid = controllerIndexInitialized &&
                               (Date.now() - controllerIndexBuildTime < CACHE_VALIDITY_TIME);

            if (!isCacheValid) {
                const buildResult = await buildControllerPathIndex();
                vscode.window.showInformationMessage(
                    `✅ 索引已构建：${buildResult.count} 条路径（耗时 ${buildResult.time}ms）`
                );
            } else {
                // 缓存已初始化，无需重建（除非文件监听器标记为过期）
                console.log(`✅ 使用缓存：${controllerPathIndex.size} 条路径`);
            }

            // 6. 搜索匹配的 Controller（使用缓存或全量搜索）
            let matches;
            let cancelled = false;
            await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: '🔍 搜索中...',
                    cancellable: true
                },
                async (progress, token) => {
                    // 监听取消事件
                    token.onCancellationRequested(() => {
                        cancelled = true;
                        console.log('用户取消了搜索');
                    });

                    matches = await findControllersByPath(inputPath, true, matchType);
                }
            );

            // 如果用户取消了搜索，直接返回
            if (cancelled) {
                vscode.window.showInformationMessage('🚫 搜索已取消');
                return;
            }

            if (matches.length === 0) {
                // 构建详细的错误消息
                let errorMsg = `❌ 未找到匹配的 Controller（查找路径：${inputPath}）\n\n`;

                if (matches._searchInfo) {
                    const info = matches._searchInfo;
                    if (info.fromCache) {
                        errorMsg += `📊 使用缓存搜索\n`;
                        errorMsg += `   索引包含 ${info.indexSize} 条 REST 路径\n`;
                    } else {
                        errorMsg += `🔍 全量搜索\n`;
                        errorMsg += `   扫描 ${info.filesScanned} 个 Java 文件\n`;
                        errorMsg += `   耗时 ${info.searchTime}ms\n`;
                        if (info.indexSize > 0) {
                            errorMsg += `   找到 ${info.indexSize} 条 REST 路径，但无匹配项\n`;
                        } else {
                            errorMsg += `   未在项目中找到任何 REST Controller\n`;
                        }
                    }
                }

                errorMsg += `\n💡 排查建议：\n`;
                errorMsg += `   • 检查输入路径格式是否正确 (如 /api/user/list)\n`;
                errorMsg += `   • 确保方法有 @RequestMapping/@GetMapping 等注解\n`;
                errorMsg += `   • 确保类有 @RestController/@Controller 注解`;

                vscode.window.showErrorMessage(errorMsg);
                return;
            }

            // 7. 处理结果
            if (matches.length === 1) {
                const match = matches[0];
                await openControllerAtLine(match);
                vscode.window.showInformationMessage(
                    `✅ 已打开 Controller: ${match.className}.${match.methodName}()`
                );
            } else {
                const quickPickItems = matches.map(m => ({
                    label: `${m.className}.${m.methodName}()`,
                    description: m.fullPath,
                    detail: `${m.package} (line ${m.line + 1})`,
                    match: m
                }));

                const selected = await vscode.window.showQuickPick(quickPickItems, {
                    placeHolder: '选择要打开的 Controller'
                });

                if (selected) {
                    await openControllerAtLine(selected.match);
                    vscode.window.showInformationMessage(
                        `✅ 已打开 Controller: ${selected.match.className}.${selected.match.methodName}()`
                    );
                }
            }
        } catch (error) {
            vscode.window.showErrorMessage(`❌ 错误: ${error.message}`);
            console.error('navigateToController error:', error);
        }
    });

    // 清除 Controller 导航缓存命令
    let clearControllerCacheCommand = vscode.commands.registerCommand('advCopy.clearControllerCache', async () => {
        try {
            clearControllerCache();
            vscode.window.showInformationMessage('✅ 已成功清除 Controller 导航缓存');
            console.log('🗑️  Controller 导航缓存已清除');
        } catch (error) {
            vscode.window.showErrorMessage(`❌ 缓存清除失败: ${error.message}`);
            console.error('clearControllerCache error:', error);
        }
    });

    // 添加文件监听器（工作区文件变化检测）
    const fileWatcher = vscode.workspace.createFileSystemWatcher('**/*.java');
    const pendingJavaFileUpdates = new Map();
    let cacheInvalidateTimer = null;

    const flushJavaFileUpdates = async () => {
        cacheInvalidateTimer = null;
        if (isIndexBuilding) {
            cacheInvalidateTimer = setTimeout(flushJavaFileUpdates, CACHE_INVALIDATE_DELAY);
            return;
        }

        const updates = Array.from(pendingJavaFileUpdates.entries());
        pendingJavaFileUpdates.clear();
        for (const [filePath, operation] of updates) {
            if (controllerIndexInitialized) {
                await incrementalUpdateIndex(filePath, operation);
            } else {
                CHANGED_FILES.add(filePath);
            }
        }
    };

    const scheduleJavaFileUpdate = (filePath, operation) => {
        pendingJavaFileUpdates.set(filePath, operation);
        clearTimeout(cacheInvalidateTimer);
        cacheInvalidateTimer = setTimeout(flushJavaFileUpdates, CACHE_INVALIDATE_DELAY);
    };

    fileWatcher.onDidCreate((event) => {
        scheduleJavaFileUpdate(event.fsPath, 'create');
    });

    fileWatcher.onDidChange((event) => {
        scheduleJavaFileUpdate(event.fsPath, 'change');
    });

    fileWatcher.onDidDelete((event) => {
        scheduleJavaFileUpdate(event.fsPath, 'delete');
    });

    const watcherQueueDisposable = {
        dispose() {
            clearTimeout(cacheInvalidateTimer);
            pendingJavaFileUpdates.clear();
        }
    };

    context.subscriptions.push(copyRef, copyRestPath, copyVmtool, copyTimeTunnel, copyPlain, pastePlain, copyAsJson, copySql, arthCommand, navigateToController, clearControllerCacheCommand, fileWatcher, watcherQueueDisposable, workspaceFolderChangeDisposable);
}

function deactivate() {}
module.exports = { activate, deactivate };