// Cuts demo/raw.webm into an exactly 180 s demo/demo.mp4. Nothing is reordered or faked: the waiting stages
// (Apify scrape, analysis, dates) are sped up uniformly and labelled on screen; everything else plays at 1x.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const TOTAL = 180;
const FPS = 30;
const { marks } = JSON.parse(readFileSync("demo/marks.json", "utf8")) as { marks: { name: string; t: number }[] };
const rawDur = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", "demo/raw.webm"]).toString());
const at = (n: string) => marks.find((m) => m.name === n)!.t;

const order = ["intro", "fill", "scrape", "analyze", "dates", "ranked", "profile", "date", "datenight", "rankings", "how", "outro"];
const elastic = new Set(["scrape", "analyze", "dates"]);
const segs = order.map((name, i) => ({ name, a: at(name), b: i + 1 < order.length ? at(order[i + 1]) : rawDur }));
const outro = segs.at(-1)!;

// Everything before the outro plays at 1x except the waits, which are sped up only as much as needed.
const body = segs.slice(0, -1);
const F = body.filter((s) => !elastic.has(s.name)).reduce((x, s) => x + s.b - s.a, 0);
const R = body.filter((s) => elastic.has(s.name)).reduce((x, s) => x + s.b - s.a, 0);
const OUTRO_MIN = 6;
let fixedK = 1;
let elasticK = Math.max(1, R / (TOTAL - OUTRO_MIN - F));
if (elasticK > 4) {
  elasticK = 4;
  fixedK = F / (TOTAL - OUTRO_MIN - R / 4);
}
const used = F / fixedK + R / elasticK;
outro.b = Math.min(outro.b, outro.a + (TOTAL - used) * fixedK + 1);

const font = "C\\:/Windows/Fonts/arialbd.ttf";
let t = 0;
const timeline: { name: string; start: number; end: number; speed: number }[] = [];
const parts = segs.map((s, i) => {
  const k = elastic.has(s.name) ? elasticK : fixedK;
  const out = (s.b - s.a) / k;
  timeline.push({ name: s.name, start: +t.toFixed(2), end: +(t + out).toFixed(2), speed: +k.toFixed(2) });
  t += out;
  const label = elastic.has(s.name) && k > 1.05
    ? `,drawtext=fontfile='${font}':text='LIVE RUN  ·  ${k.toFixed(1)}x speed while waiting':x=w-tw-24:y=h-th-20:fontsize=18:fontcolor=white:box=1:boxcolor=0x000000AA:boxborderw=10`
    : "";
  return `[0:v]trim=start=${s.a.toFixed(3)}:end=${s.b.toFixed(3)},setpts=(PTS-STARTPTS)/${k.toFixed(5)},fps=${FPS}${label}[v${i}]`;
});
const graph = `${parts.join(";\n")};\n${segs.map((_, i) => `[v${i}]`).join("")}concat=n=${segs.length}:v=1:a=0,tpad=stop_mode=clone:stop_duration=0.2,format=yuv420p[out]`;
writeFileSync("demo/filter.txt", graph);

execFileSync("ffmpeg", [
  "-y", "-loglevel", "error", "-i", "demo/raw.webm", "-/filter_complex", "demo/filter.txt", "-map", "[out]",
  "-frames:v", String(TOTAL * FPS), "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-movflags", "+faststart", "demo/demo.mp4",
], { stdio: "inherit" });

writeFileSync("demo/timeline.json", JSON.stringify({ elasticK, fixedK, timeline }, null, 2));
console.log(JSON.stringify({ elasticK: elasticK.toFixed(2), fixedK: fixedK.toFixed(2), timeline }, null, 1));
