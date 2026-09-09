const fs = require('node:fs');
const ts = require('typescript');
const cp = require('node:child_process');
const files = cp.execFileSync('rg', ['--files', 'src'], { encoding: 'utf8' }).trim().split('\n').filter(file => /\.tsx$/.test(file));
for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const endpoints = new Map();
  source.statements.forEach(statement => {
    if (ts.isImportDeclaration(statement) && /(?:endpoints-sdk|app-endpoints-sdk)$/.test(statement.moduleSpecifier.text)) {
      const bindings = statement.importClause?.namedBindings;
      if (bindings && ts.isNamedImports(bindings)) bindings.elements.forEach(element => {
        if (!element.isTypeOnly) endpoints.set(element.name.text, (element.propertyName || element.name).text);
      });
    }
  });
  if (!endpoints.size) continue;
  const groups = new Map();
  function walk(node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && endpoints.has(node.expression.text)) {
      let parent = node.parent;
      while (parent && !ts.isVariableDeclaration(parent) && !ts.isExpressionStatement(parent)) parent = parent.parent;
      // Record the nearest named function or effect, including outer loaders.
      let owner = node.parent;
      while (owner && !(ts.isArrowFunction(owner) || ts.isFunctionDeclaration(owner) || ts.isFunctionExpression(owner))) owner = owner.parent;
      while (owner && !ts.isFunctionDeclaration(owner)) {
        if (ts.isVariableDeclaration(owner.parent)) break;
        if (ts.isCallExpression(owner.parent) && ['useEffect', 'useCallback', 'useReactiveLoader'].includes(owner.parent.expression.getText(source))) break;
        owner = owner.parent;
        while (owner && !(ts.isArrowFunction(owner) || ts.isFunctionDeclaration(owner) || ts.isFunctionExpression(owner))) owner = owner.parent;
      }
      if (owner) {
        const line = source.getLineAndCharacterOfPosition(owner.getStart()).line + 1;
        const entry = groups.get(line) || { file, line, owner: owner.parent.getText(source).slice(0, 110).replace(/\s+/g, ' '), endpoints: [] };
        entry.endpoints.push(endpoints.get(node.expression.text));
        groups.set(line, entry);
      }
    }
    ts.forEachChild(node, walk);
  }
  walk(source);
  for (const entry of groups.values()) process.stdout.write(JSON.stringify({ ...entry, endpoints: [...new Set(entry.endpoints)] }) + '\n');
}
