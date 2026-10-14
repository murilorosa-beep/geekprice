import assert from "node:assert/strict";

// Equivalent PostgreSQL deparser details must not manufacture migrations.
// Raw introspection is kept in .tools/historical-snapshots for comparison.
export function normalizeHistoricalSnapshot(snapshot, baseline, defaultOpclasses) {
  const checkForm = value => value.replace(/"[^"]+"\./g, "").replaceAll('"', "")
    .replace(/\(0\)::numeric/g, "0").replace(/\(0\)/g, "0").replace(/\s+/g, " ").trim();
  for (const [name, table] of Object.entries(snapshot.tables)) {
    for (const index of Object.values(table.indexes)) {
      for (const column of index.columns) {
        if (defaultOpclasses.has(column.opclass)) delete column.opclass;
        const expression = /^(lower|upper)\(\(([a-z_]+)\)::text\)$/.exec(column.expression);
        if (column.isExpression && expression) column.expression = `${expression[1]}("${expression[2]}")`;
      }
    }
    for (const [checkName, check] of Object.entries(table.checkConstraints)) {
      const previous = baseline.tables[name]?.checkConstraints[checkName];
      if (previous) {
        assert.equal(checkForm(check.value), checkForm(previous.value));
        check.value = previous.value;
      }
    }
  }
  return snapshot;
}
