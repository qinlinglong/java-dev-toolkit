# Changelog

## [1.3.0] - 2026-03-27

### 🎉 New Features

#### Navigate to Controller
- **New Command**: `advCopy.navigateToController` (Ctrl+Alt+N / Cmd+Alt+N)
- **Functionality**: Paste a REST path and automatically find and open the corresponding Controller method
- **Matching Strategy**:
  - Exact match: Complete path equality (e.g., `/api/user/list`)
  - Prefix match: Input path is a prefix of the target path (e.g., input `/api/user` matches `/api/user/list`)
  - Priority: Exact matches are listed first in the quick pick menu
- **Features**:
  - Single match: Direct navigation without menu
  - Multiple matches: Quick pick menu with method details (package, class, line number)
  - Error handling: Friendly messages for empty clipboard, invalid paths, and no matches

#### Arthas Command Library Expansion
- **Expanded**: Command count increased from 15 to 59 (+44 new commands)
- **Implementation**: Comprehensive coverage of method monitoring, class inspection, and global commands

### 🔧 Implementation Details

#### Helper Functions
- `parseJavaFileForControllers(filePath)`: Parse Java files and extract Controller methods with @RequestMapping annotations
- `findControllersByPath(inputPath)`: Search all Java files in workspace for matching REST paths
- `openControllerAtLine(match)`: Open file and navigate to method line with center reveal

#### Configuration Updates
- **package.json**: Added command definition, menu item, and keybinding
- **README.md**: Added to keyboard shortcuts table and usage methods table
- **Changelog**: Full documentation of new features

### ✨ Code Quality
- ✅ Syntax validation passed for extension.js
- ✅ JSON validation passed for package.json
- ✅ All helper functions properly documented with JSDoc comments
- ✅ Error handling for all edge cases

### 📝 Documentation
- Added keyboard shortcut table entry
- Added usage method description with feature icons
- Updated v1.3.0 changelog with full feature details

---

## [1.2.0] - 2026-03-27

### 🎉 Major Updates

#### SQL Copy Feature Enhancement
- **Fixed**: SQL copy on class names now correctly identifies fields instead of defaulting to `*`
- **Improved**: Three-tier fallback mechanism for better field detection
  - Primary: Symbol provider detection
  - Secondary: Text pattern matching
  - Tertiary: Wildcard fallback

#### Arthas Command Library Expansion
- **Expanded**: Command count increased from 15 to 59 (+44 new commands)
- **Category Breakdown**:
  - Method-related: 11 → 22 commands (+11)
  - Class-related: 7 → 13 commands (+6)
  - Global commands: 9 → 24 commands (+15)

### 🔧 Bug Fixes

#### Command Parameter Corrections
1. **watch command**: Fixed `-x` parameter max value (5 → 4)
   - Corrected to match official Arthas documentation

2. **trace command**: Fixed parameter name (`-l` → `-n`)
   - `-n`: Number of execution times to monitor (correct)
   - `-l`: Invalid parameter (removed)

3. **monitor command**: Fixed parameter order
   - Correct: `monitor {className} {methodName} -c 5`
   - Previous: `monitor -c 5 {className} {methodName}`

4. **sm command**: Fixed parameter (`-l` → `-d`)
   - `-d`: Display detailed information (correct)
   - `-l`: Invalid for search method (removed)

5. **stack command**: Normalized condition syntax
   - Correct: `stack {className} {methodName} "#cost>50"`
   - Previous: Used non-standard condition syntax

### ✨ New Arthas Commands

#### Watch Command Variants
- `watch (调用前)` - Monitor parameters before method call (-b flag)
- `watch (异常监控)` - Monitor thrown exceptions (-e flag)
- `watch (条件监控)` - Improved conditional monitoring with standard syntax

#### Trace Command Variants
- `trace (性能过滤)` - Filter calls by execution time (#cost>100ms)

#### Stack Command Variants
- `stack (条件堆栈)` - Conditional stack traces with standard syntax

#### Monitor Command Variants
- `monitor (自定义周期)` - Customizable refresh cycle

#### SM Command Variants
- `sm (详细搜索)` - Display detailed method information (-d flag)

#### TT (Time Tunnel) Command Suite
- `tt (时间隧道)` - Record method invocation data
- `tt (查看记录)` - View detailed recording information
- `tt (重放调用)` - Replay recorded method calls
- `tt (搜索记录)` - Search recordings with OGNL expressions

#### Expression Commands
- `ognl (获取对象属性)` - Retrieve object property values
- `getstatic (获取静态字段)` - Retrieve static field values

#### SC Command Variants
- `sc (搜索类)` - Basic class search
- `sc (详细搜索)` - Detailed class information
- `sc (搜索接口实现)` - Search classes implementing specific interfaces

#### Classloader Commands
- `classloader (类加载详情)` - Display specific classloader information
- `classloader (查找资源)` - Locate resources in classpath

#### Dump Command Variants
- `dump (转储到指定目录)` - Dump class to custom directory

#### Sysprop Command Variants
- `sysprop (查询属性)` - Query specific system property
- `sysprop (设置属性)` - Set system property values

#### Thread Command Variants
- `thread (线程信息)` - Display current thread info
- `thread (指定线程ID)` - Display specific thread details

#### Heapdump Variants
- `heapdump (强制转储)` - Dump only live objects (--live flag)

#### Histogram Variants
- `histogram (实时更新)` - Display top objects with real-time updates

#### Vmtool Variants
- `vmtool (获取实例)` - Retrieve instances of specific classes

#### New Global Commands
- `mbean (JMX查询)` - List JMX bean information
- `vmoption (查看VM选项)` - Display all JVM options
- `vmoption (查询选项)` - Query specific JVM option value
- `vmoption (修改选项)` - Modify JVM option values
- `perfcounter (性能计数)` - Display JVM performance counters
- `profiler (采样器)` - Start CPU sampling
- `profiler (停止采样)` - Stop sampling and generate HTML report

### 🔍 Code Quality
- ✅ Syntax validation passed for all changes
- ✅ All command parameters verified against official documentation
- ✅ Synchronized updates across all file copies

### 📝 Documentation
- Updated command descriptions with more detailed usage information
- Added examples for complex commands like tt and profiler

### 🚀 Installation
- Direct VSIX installation via VS Code Extension Manager
- Command-line installation support

---

## [1.2.0-rc1] - 2026-02-15

### Initial Release
- Basic Java development utilities
- REST path copying
- Arthas command support
- SQL and JSON structure generation
