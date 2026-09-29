// Adds an English voiceover to demo/demo.mp4 (Windows System.Speech TTS), one line per scene, aligned to
// demo/timeline.json. Writes demo/demo-final.mp4 and demo/script.md.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const LINES: Record<string, string> = {
  intro: "This is Date by Proxy. Every person is an AI agent, and the agents date each other.",
  fill: "Let's add a real person, live. I paste Ashneer Grover's LinkedIn and his public Instagram, say he is a man looking for women, and hit create.",
  scrape: "Apify is now scraping both profiles for real. The LinkedIn scraper pulls his experience, education and skills. The Instagram scraper pulls his bio and latest posts.",
  analyze: "Now the Analyst agent reads everything. A vision model describes his Instagram photos, and a reasoning model writes his needs, hobbies and values.",
  dates: "His agent is now on real dates with every woman in the pool. Each agent only knows its own person, and every message is a separate model call. You can watch the conversation live.",
  ranked: "After each date, both agents write a private verdict. Here is his ranking.",
  profile: "This is his profile page. Who he is, what his Instagram shows, what he needs in a partner, his hobbies, interests, values and dealbreakers. Tap any tag to see the exact LinkedIn field or Instagram post behind it, with a confidence score. On the right, who fits him best.",
  date: "Let's open his best date. Two agents, eight turns: icebreaker, lifestyle, values and goals, dealbreakers, and a closing. Then each side writes a private verdict: fit, chemistry, values, lifestyle, second date or not, and the reasons, quoting the conversation.",
  datenight: "Date Night shows every date in the pool. Thirty real people and nearly two hundred dates, all really run.",
  rankings: "Rankings combine both verdicts: seventy percent your agent's view, thirty percent theirs, a penalty for a dealbreaker, and a bonus when both want a second date. Here are the strongest mutual matches and everyone's top five.",
  how: "How it works: Apify scrapes only LinkedIn and public Instagram, Groq runs the agents, Supabase stores every message and verdict, and dates only happen between people who would want to meet.",
  outro: "Thirty real people, every insight backed by evidence. Paste your own links on the live site, and your agent goes on its first dates.",
};

const { timeline } = JSON.parse(readFileSync("demo/timeline.json", "utf8")) as { timeline: { name: string; start: number; end: number }[] };
mkdirSync("demo/vo", { recursive: true });

const ps = ["Add-Type -AssemblyName System.Speech", "$s = New-Object System.Speech.Synthesis.SpeechSynthesizer", "$s.Rate = 1"];
for (const seg of timeline) {
  ps.push(`$s.SetOutputToWaveFile('${resolve(`demo/vo/${seg.name}.wav`)}')`, `$s.Speak('${LINES[seg.name].replace(/'/g, "''")}')`);
}
ps.push("$s.SetOutputToNull()", "$s.Dispose()");
writeFileSync("demo/vo/tts.ps1", ps.join("\r\n"));
execFileSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "demo/vo/tts.ps1"], { stdio: "inherit" });

const dur = (f: string) => Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).toString());
const inputs: string[] = [];
const filters: string[] = [];
const script: string[] = ["# Demo video script (3:00)", ""];
const mmss = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
timeline.forEach((seg, i) => {
  const f = `demo/vo/${seg.name}.wav`;
  inputs.push("-i", f);
  const slot = seg.end - seg.start - 0.4;
  const tempo = Math.min(1.4, Math.max(1, dur(f) / slot));
  filters.push(`[${i + 1}:a]atempo=${tempo.toFixed(3)},adelay=delays=${Math.round((seg.start + 0.25) * 1000)}:all=1[a${i}]`);
  script.push(`**${mmss(seg.start)} - ${mmss(seg.end)}**  ${LINES[seg.name]}`, "");
});
filters.push(`${timeline.map((_, i) => `[a${i}]`).join("")}amix=inputs=${timeline.length}:normalize=0,apad,atrim=0:180[a]`);
writeFileSync("demo/vo/filter.txt", filters.join(";\n"));
execFileSync("ffmpeg", [
  "-y", "-loglevel", "error", "-i", "demo/demo.mp4", ...inputs, "-/filter_complex", "demo/vo/filter.txt",
  "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-t", "180", "demo/demo-final.mp4",
], { stdio: "inherit" });
writeFileSync("demo/script.md", script.join("\n"));
console.log(script.join("\n"));
