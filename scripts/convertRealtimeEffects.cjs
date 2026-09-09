const fs = require('node:fs');
const ts = require('typescript');
const chunks = [];
for (const file of process.argv.slice(2)) {
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
  let count = 0;
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(source) === 'useEffect' && node.arguments.length === 2) {
      const fn = node.arguments[0];
      if (!ts.isArrowFunction(fn) || fn.parameters.length) return;
      const calls = [];
      function find(child) {
        if (ts.isCallExpression(child) && ts.isIdentifier(child.expression) && endpoints.has(child.expression.text)) calls.push(child);
        ts.forEachChild(child, find);
      }
      find(fn.body);
      if (!calls.length || calls.some(call => !/^(get|list|load|check)/.test(endpoints.get(call.expression.text)))) return;
      const add = (start, end, text) => edits.push({ start, end, text });
      add(node.expression.getStart(), node.expression.end, 'useReactiveEffect');
      add(fn.parameters.pos, fn.parameters.pos, 'read');
      for (const call of calls) {
        add(call.getStart(), call.getStart(), 'read(() => ');
        add(call.end, call.end, ')');
      }
      const firstRead = Math.min(...calls.map(call => call.getStart()));
      function guard(child) {
        if (ts.isCallExpression(child) && ts.isIdentifier(child.expression) && /^set[A-Z]/.test(child.expression.text)) {
          let parent = child.parent;
          let errorHandler = false;
          while (parent && parent !== fn) {
            if (ts.isCatchClause(parent) || ((ts.isArrowFunction(parent) || ts.isFunctionExpression(parent)) && ts.isCallExpression(parent.parent) && ts.isPropertyAccessExpression(parent.parent.expression) && parent.parent.expression.name.text === 'catch' && parent.parent.arguments.includes(parent))) errorHandler = true;
            parent = parent.parent;
          }
          // Keep table content, loading state and filters during background
          // work. Result setters run only for the current effect generation.
          const guard = child.getStart() < firstRead || errorHandler ? '!read.background && !read.cancelled && ' : '!read.cancelled && ';
          add(child.getStart(), child.getStart(), guard);
        }
        ts.forEachChild(child, guard);
      }
      guard(fn.body);
      count++;
      return;
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  if (!count) continue;
  if (!original.includes("from '@/hooks/useReactiveEffect'")) {
    const position = source.statements.find(ts.isImportDeclaration)?.getStart() || 0;
    edits.push({ start: position, end: position, text: "import { useReactiveEffect } from '@/hooks/useReactiveEffect';\n" });
  }
  const lines = source.getLineStarts();
  const groups = [];
  for (const edit of edits.sort((a, b) => a.start - b.start)) {
    const start = lines[Math.max(0, source.getLineAndCharacterOfPosition(edit.start).line - 3)];
    const end = lines[source.getLineAndCharacterOfPosition(edit.end).line + 4] ?? original.length;
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
  process.stderr.write(`${file}: ${count} effects\n`);
}
process.stdout.write('*** Begin Patch\n' + chunks.join('\n') + '\n*** End Patch\n');
