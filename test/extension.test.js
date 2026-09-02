const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function loadExtensionInternals() {
    const filename = path.join(__dirname, '..', 'extension.js');
    const source = fs.readFileSync(filename, 'utf8').replace(
        'module.exports = { activate, deactivate };',
        'module.exports = { parseJavaFileForControllers, calculatePathMatchScore };'
    );
    const documents = new Map();
    const vscode = {
        Uri: { file: (fsPath) => ({ fsPath }) },
        Range: class Range {
            constructor(startLine, startCharacter, endLine, endCharacter) {
                this.start = { line: startLine, character: startCharacter };
                this.end = { line: endLine, character: endCharacter };
            }
        },
        workspace: {
            openTextDocument: async ({ fsPath }) => ({
                getText: () => documents.get(fsPath)
            })
        }
    };
    const module = { exports: {} };
    const sandbox = {
        module,
        exports: module.exports,
        require: (name) => name === 'vscode' ? vscode : require(name),
        console,
        setTimeout,
        clearTimeout
    };
    vm.runInNewContext(source, sandbox, { filename });
    return { ...module.exports, documents };
}

test('indexes mappings that rely only on the class-level path', async () => {
    const { parseJavaFileForControllers, documents } = loadExtensionInternals();
    const file = '/tmp/UserController.java';
    documents.set(file, [
        '@RestController',
        '@RequestMapping("/users")',
        'public class UserController {',
        '  @GetMapping',
        '  public String list() { return "ok"; }',
        '}'
    ].join('\n'));

    const result = await parseJavaFileForControllers(file);
    assert.equal(result.methods.length, 1);
    assert.equal(result.methods[0].fullPath, '/users');
    assert.equal(result.methods[0].name, 'list');
});

test('indexes a mapping and method declared on the same line', async () => {
    const { parseJavaFileForControllers, documents } = loadExtensionInternals();
    const file = '/tmp/HealthController.java';
    documents.set(file, [
        '@RestController',
        'public class HealthController {',
        '  @GetMapping("/health") public String health() { return "ok"; }',
        '}'
    ].join('\n'));

    const result = await parseJavaFileForControllers(file);
    assert.equal(result.methods.length, 1);
    assert.equal(result.methods[0].fullPath, '/health');
    assert.equal(result.methods[0].name, 'health');
});

test('does not reuse one target segment for repeated fuzzy input segments', () => {
    const { calculatePathMatchScore } = loadExtensionInternals();
    const result = calculatePathMatchScore('/user/user', '/user/order');
    assert.equal(result.matchDetails.length, 1);
    assert.ok(result.score < 1);
});
