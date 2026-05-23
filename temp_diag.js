const ts = require("typescript");
const fs = require("fs");
const p = "components/admin/candidate-profile/interview-report-sreevaai.tsx";
const s = fs.readFileSync(p, "utf8");
const sf = ts.createSourceFile(p, s, ts.ScriptTarget.ES2020, true, ts.ScriptKind.TSX);
const r = ts.transpileModule(s, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext }, reportDiagnostics: true, fileName: p });
const diags = (r.diagnostics || []).slice(0, 25);
for (const d of diags) {
  const pos = d.start ?? 0;
  const lc = ts.getLineAndCharacterOfPosition(sf, pos);
  console.log(`${lc.line + 1}:${lc.character + 1} ${ts.flattenDiagnosticMessageText(d.messageText, ' | ')}`);
}
console.log('count', (r.diagnostics || []).length);
