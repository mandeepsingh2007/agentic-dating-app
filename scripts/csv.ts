import fs from "node:fs";

export function readCsv(file: string): Record<string, string>[] {
  const [header, ...lines] = fs.readFileSync(file, "utf8").trim().split(/\r?\n/);
  const cols = header.split(",").map((c) => c.trim());
  return lines.filter(Boolean).map((line) => {
    const vals = line.split(",").map((v) => v.trim());
    return Object.fromEntries(cols.map((c, i) => [c, vals[i] ?? ""]));
  });
}

export function writeCsv(file: string, rows: Record<string, string>[], cols: string[]) {
  const body = rows.map((r) => cols.map((c) => (r[c] ?? "").replace(/,/g, " ")).join(","));
  fs.writeFileSync(file, [cols.join(","), ...body].join("\n") + "\n");
}
