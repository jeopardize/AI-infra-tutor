const REF_RE = /\[@(tbl|eq):([\w-]+)\]/g;
const num = new Map([["perf", { id: "perf", no: 1, kind: "tbl" }]]);
const nodes = [{ type: "text", value: "见[@tbl:perf]。" }];
let iter = 0;
for (let i = 0; i < nodes.length; i++) {
  const n = nodes[i];
  iter++;
  if (iter > 10) { console.log("INFINITE at i", i); break; }
  console.log("i", i, n.type, n.value?.slice?.(0, 30));
  if (n.type === "text" && /[@](tbl|eq):/.test(n.value)) {
    const parts = [];
    let last = 0;
    for (const m of n.value.matchAll(REF_RE)) {
      console.log("match", m[0], "idx", m.index);
      const idx = m.index ?? 0;
      if (idx > last) parts.push({ type: "text", value: n.value.slice(last, idx) });
      const def = num.get(m[2]);
      if (def) {
        parts.push({ type: "element", tagName: "a", properties: { href: "#x" }, children: [{ type: "text", value: "表 1" }] });
      } else {
        parts.push({ type: "text", value: `⚠️${m[0]}` });
      }
      last = idx + m[0].length;
    }
    if (last < n.value.length) parts.push({ type: "text", value: n.value.slice(last) });
    if (parts.length) nodes.splice(i, 1, ...parts);
    console.log("parts len", parts.length, "nodes now", nodes.length);
  }
}
console.log("done", JSON.stringify(nodes));
