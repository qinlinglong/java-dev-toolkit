# Changelog

## [1.1.3] - 2026-09-02

### Changed
- Unified the release version across Java Dev Toolkit and all generated plugin aliases.
- Regenerated VSIX packages from the complete current implementation.
- Kept development files, historical archives, and local configuration out of release packages.

---

## [1.1.2] - 2026-04-13

### Added
- **Fuzzy Search for REST Navigation**: Enhanced Controller navigation with intelligent fuzzy matching
  - Levenshtein distance algorithm for typo tolerance (e.g., "usre" matches "user")
  - CamelCase parsing support (e.g., "userCont" matches "UserController")
  - Abbreviation matching (e.g., "uc" matches "UserController")
  - Multi-strategy scoring system with 8 matching levels
  - Smart result ranking by relevance score

### Changed
- **Search Algorithm Optimization**: Improved findControllersByPath function
  - Added fallback fuzzy search when exact/prefix/suffix matching fails
  - Implemented path segment-level matching with comprehensive scoring
  - Set minimum score threshold (0.3) to filter low-quality results
  - Maintained backward compatibility with existing matching strategies

### Technical Details
- New functions: `levenshteinDistance()`, `calculateSimilarity()`, `camelCaseToWords()`
- New functions: `isAbbreviationMatch()`, `calculateSegmentScore()`, `calculatePathMatchScore()`
- New function: `fuzzySearchControllers()` - main fuzzy search entry point
- Scoring weights: exact(1.0), prefix(0.9), suffix(0.85), camelPrefix(0.8), contains(0.75), camelContains(0.7), abbreviation(0.65), fuzzy(0.6*similarity)
- Final score formula: coverage * 0.4 + avgQuality * 0.6 + bonus(0.1)

---

## [1.1.0] - 2026-04-03

### Added
- **SQL Field Filtering Enhancement**: Added Stream, Optional, Supplier, Consumer, Function, Predicate, Comparator to complex type filtering
- **Improved Field Declaration Regex**: Now supports annotations, volatile modifier, nested generics, and array types
- **Helper Functions**: Added `isComplexType()` and `getFieldRegex()` for better code maintainability
- **Bilingual README**: Added English and Chinese versions with language switcher

### Changed
- **SQL Copy Accuracy**: Improved field detection to correctly exclude Stream/Optional and other functional interfaces
- **Code Quality**: Extracted common filtering logic into reusable functions
- **Performance**: Optimized regex patterns for faster field detection
- **Documentation**: Completely rewritten README with dual-language support and improved examples

### Fixed
- SQL field filtering now correctly excludes Stream, Optional, and other non-database types
- Field declaration regex now properly matches annotated fields
- Fixed regex handling for volatile modifiers and nested generics
- Improved array type detection in field declarations

### Technical Details
- New constant: `COMPLEX_TYPE_KEYWORDS` (11 keywords)
- New constant: `FIELD_DECLARATION_REGEX` (improved regex pattern)
- Updated: 6 field filtering locations to use `isComplexType()`
- Updated: 5 fieldRegex usages to use `getFieldRegex()`

---

## [1.0.2] - 2026-03-27

### Fixed
- **SQL Field Recognition**: Changed from whitelist to blacklist mechanism
- SQL field filtering now only excludes List/Map/Set/Collection/Array instead of being overly restrictive
- Fixed issue where Copy SQL on class name wasn't identifying any fields
- Ensured Copy SQL feature now aligns with Copy JSON field identification logic

### Changed
- Field filtering strategy: Whitelist → Blacklist approach
- SQL generation now correctly shows field names instead of SELECT *

---

## [1.0.1] - 2026-03-26

### Changed
- **Menu Name Unification**: Renamed right-click menu from "JavaDev Copilot" to "Java Dev Toolkit"
- Updated all UI elements to use new brand name
- Simplified quick start instructions

---

## [1.0.0] - 2026-03-25

### Added
- Initial release of Java Dev Toolkit (renamed from JavaDev Copilot)
- 10 core commands for Java development
- Complete keyboard shortcut configuration
- Single-level context menu design
- Support for Spring MVC, JAX-RS, and Feign frameworks
- 59+ Arthas diagnostic commands
- Bilingual documentation (English and Chinese)

### Features
1. Copy Reference - Extract fully qualified Java paths
2. Copy REST Full Path - Get complete REST API paths
3. Navigate to Controller - Find controller by REST path
4. Copy as JSON - Generate JSON from Java classes
5. Copy as SQL - Generate SQL SELECT from classes
6. Copy Arthas Vmtool - Generate vmtool commands
7. Copy Arthas TimeTunnel - Generate tt commands
8. Copy More Arthas Commands - Access 59+ commands
9. Copy Pure Content - Extract plain text from strings
10. Paste as Java String - Smart paste with escaping

---

## [0.x] - Earlier versions

Previous versions under the name "Advanced Copy for Java" (not documented here)
