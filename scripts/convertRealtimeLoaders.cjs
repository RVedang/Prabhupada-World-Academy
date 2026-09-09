// Mechanical, reviewable migration. Emits an apply_patch patch; never edits files.
const fs = require('node:fs');
const ts = require('typescript');
const requested = process.argv.slice(2);
const chunks = [];
for (const file of requested) {
  const original = fs.readFileSync(file, 'utf8');
  const source = ts.createSourceFile(file, original, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const endpoints = new Map();
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !/(?:endpoints-sdk|app-endpoints-sdk)$/.test(statement.moduleSpecifier.text)) continue;
    const bindings = statement.importClause?.namedBindings;
    if (bindings && ts.isNamedImports(bindings)) for (const element of bindings.elements) {
      if (!element.isTypeOnly) endpoints.set(element.name.text, (element.propertyName || element.name).text);
    }
  }
  const edits = [];
  const converted = new Set();
  function visit(node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && /^(?:load|fetch|reload|refresh|doFetch)/i.test(node.name.text)) {
      const initializer = node.initializer;
      const callback = initializer && ts.isCallExpression(initializer) && initializer.expression.getText(source) === 'useCallback';
      const fn = callback ? initializer.arguments[0] : initializer;
      const owner = node.parent?.parent?.parent?.parent;
      const ownerName = owner?.name?.text || (owner?.parent && ts.isVariableDeclaration(owner.parent) ? owner.parent.name.getText(source) : '');
      const topLevel = owner && (ts.isFunctionDeclaration(owner) || ts.isArrowFunction(owner) || ts.isFunctionExpression(owner)) && /^(?:[A-Z]|use[A-Z])/.test(ownerName);
      if (fn && ts.isArrowFunction(fn) && fn.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.AsyncKeyword) && topLevel) {
        const calls = [];
        function findCalls(child) {
          if (ts.isCallExpression(child) && ts.isIdentifier(child.expression) && endpoints.has(child.expression.text)) calls.push(child);
          ts.forEachChild(child, findCalls);
        }
        findCalls(fn.body);
        if (calls.length && calls.every(call => /^(get|list|load|check|lookup|preview)/.test(endpoints.get(call.expression.text)))) {
          const localEdits = [];
          const add = (start, end, text) => localEdits.push({ start, end, text });
          // Every read, including ones after awaits, belongs to this loader.
          for (const call of calls) {
            add(call.getStart(), call.getStart(), 'read(() => ');
            add(call.end, call.end, ')');
          }
          add(fn.parameters.pos, fn.parameters.pos, fn.parameters.length ? 'read, ' : 'read');
          function safeguards(child) {
            if (ts.isCallExpression(child) && ts.isIdentifier(child.expression) && /^set[A-Z]/.test(child.expression.text)) {
              const startsLoading = /^set.*(?:Loading|Fetching|Busy|Refreshing)$/.test(child.expression.text) && child.arguments[0]?.kind === ts.SyntaxKind.TrueKeyword;
              add(child.getStart(), child.getStart(), startsLoading ? '!read.background && !read.cancelled && ' : '!read.cancelled && ');
            }
            if (ts.isCatchClause(child)) add(child.block.getStart() + 1, child.block.getStart() + 1, '\n      if (read.cancelled) return;');
            ts.forEachChild(child, safeguards);
          }
          safeguards(fn.body);
          if (callback) add(initializer.expression.getStart(), initializer.expression.end, 'useReactiveLoader');
          else {
            add(fn.getStart(), fn.getStart(), 'useReactiveLoader(');
            add(fn.end, fn.end, ', [])');
          }
          edits.push(...localEdits);
          converted.add(node.name.text);
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  if (!converted.size) continue;
  function removeLegacy(node) {
    if (ts.isExpressionStatement(node) && ts.isCallExpression(node.expression) && node.expression.expression.getText(source) === 'useRealtimeRefresh') {
      const callback = node.expression.arguments[1]?.getText(source) || '';
      if ([...converted].some(name => new RegExp(`\\b${name}\\b`).test(callback))) edits.push({ start: node.getStart(), end: node.end, text: '' });
    }
    ts.forEachChild(node, removeLegacy);
  }
  removeLegacy(source);
  if (!original.includes("from '@/hooks/useReactiveLoader'")) {
    const firstImport = source.statements.find(statement => ts.isImportDeclaration(statement));
    const index = firstImport ? firstImport.getStart() : 0;
    edits.push({ start: index, end: index, text: "import { useReactiveLoader } from '@/hooks/useReactiveLoader';\n" });
  }
  const lines = source.getLineStarts();
  const groups = [];
  for (const edit of edits.sort((a, b) => a.start - b.start)) {
    const startLine = Math.max(0, source.getLineAndCharacterOfPosition(edit.start).line - 3);
    const endLine = source.getLineAndCharacterOfPosition(edit.end).line + 4;
    const start = lines[startLine], end = lines[endLine] ?? original.length;
    const last = groups.at(-1);
    if (last && start <= last.end) { last.end = Math.max(last.end, end); last.edits.push(edit); }
    else groups.push({ start, end, edits: [edit] });
  }
  const hunks = groups.map(group => {
    const before = original.slice(group.start, group.end);
    let after = before;
    for (const edit of group.edits.sort((a, b) => b.start - a.start || b.end - a.end)) after = after.slice(0, edit.start - group.start) + edit.text + after.slice(edit.end - group.start);
    return `@@\n${before.replace(/\n$/, '').split('\n').map(line => '-' + line).join('\n')}\n${after.replace(/\n$/, '').split('\n').map(line => '+' + line).join('\n')}`;
  });
  chunks.push(`*** Update File: ${file}\n${hunks.join('\n')}`);
  process.stderr.write(`${file}: ${[...converted].join(', ')}\n`);
}
process.stdout.write('*** Begin Patch\n' + chunks.join('\n') + '\n*** End Patch\n');
