import { z } from "zod";
import { chatJSON, chatText, MODELS } from "./llm";
import type { ProfileT } from "./profile-schema";
import { db, must } from "./supabase";

export const PHASES = [
  { name: "Icebreaker", goal: "Introduce yourself warmly and open with a specific hook from your own life (a hobby, a recent photo, a place)." },
  { name: "Icebreaker", goal: "React genuinely to what they said, share something of your own, and ask a curious question back." },
  { name: "Lifestyle", goal: "Talk about how you actually spend weekends, travel, fitness, social life and the pace of your life. Ask about theirs." },
  { name: "Lifestyle", goal: "Respond to their lifestyle honestly: note where you match and where you differ. Ask a follow-up." },
  { name: "Values & goals", goal: "Talk about what matters most to you, your ambitions, and what you want in a partner. Ask what they want." },
  { name: "Values & goals", goal: "Respond to their values and partner wishes; be honest about fit. Share what you need from a partner." },
  { name: "Dealbreakers", goal: "Politely probe a potential dealbreaker for you (e.g. time, ambition, lifestyle, location) with a direct but kind question." },
  { name: "Closing", goal: "Answer their question honestly and close the date warmly, saying honestly how you feel about it." },
];

type Person = { id: string; name: string };

function firstName(name: string) {
  return name.split(" ")[0];
}

export function personaPrompt(me: Person, profile: ProfileT, partner: Person) {
  const list = (xs: { label: string; detail: string }[]) => xs.map((x) => `- ${x.label}: ${x.detail}`).join("\n");
  return `You are the personal dating agent of ${me.name}. You go on dates ON THEIR BEHALF with other people's agents.
Speak in first person as ${firstName(me.name)} ("I"), natural and conversational, like a real first date over coffee. Max 70 words per message. No emojis spam, no lists, no stage directions.
You only know what is in ${firstName(me.name)}'s profile below. Never invent new facts about them. If asked something not covered, say honestly you'd have to find out or keep it vague.
You know nothing about your date except what they tell you in this conversation. Your date is ${firstName(partner.name)}.
Your secret mission: find out if ${firstName(partner.name)} truly fits ${firstName(me.name)}'s needs, values and lifestyle, and watch for dealbreakers. Be warm but honest - don't fake chemistry.

=== ${me.name.toUpperCase()}'S PROFILE (private) ===
${profile.summary}
Career: ${profile.career.current}. ${profile.career.trajectory}. Work style: ${profile.career.workStyle}
Location: ${profile.location}
Hobbies:
${list(profile.hobbies)}
Interests:
${list(profile.interests)}
Values:
${list(profile.values)}
Lifestyle:
${list(profile.lifestyle)}
Communication style: ${profile.communicationStyle}
What I need in a partner:
${list(profile.needs)}
Possible dealbreakers:
${list(profile.dealbreakers)}
Ideal date: ${profile.idealDate}`;
}

export const Verdict = z.object({
  fitScore: z.number().min(0).max(10),
  chemistry: z.number().min(0).max(10),
  valuesAlignment: z.number().min(0).max(10),
  lifestyleFit: z.number().min(0).max(10),
  dealbreakerHit: z.boolean(),
  wantsSecondDate: z.boolean(),
  headline: z.string().describe("One-line honest take on the date, e.g. 'Great banter, but our pace of life clashes'"),
  topReasons: z.array(z.string()).min(1).max(4),
  concerns: z.array(z.string()),
  evidence: z.array(z.object({ quoteFromDate: z.string(), linkedToMyNeed: z.string() })).max(4),
});
export type VerdictT = z.infer<typeof Verdict>;

async function loadSide(id: string) {
  const person = must(await db().from("people").select("id,name").eq("id", id).single()) as Person;
  const prof = must(await db().from("profiles").select("data").eq("person_id", id).single()) as { data: ProfileT };
  return { person, profile: prof.data };
}

/** Runs one full date: 8 turns, each a separate LLM call that only sees its own persona. */
export async function runDate(dateId: string) {
  const date = must(await db().from("dates").select("*").eq("id", dateId).single()) as { id: string; a_id: string; b_id: string; status: string };
  if (date.status === "done") return;
  await db().from("date_messages").delete().eq("date_id", dateId);
  await db().from("verdicts").delete().eq("date_id", dateId);
  await db().from("dates").update({ status: "live", error: null }).eq("id", dateId);

  try {
    const A = await loadSide(date.a_id);
    const B = await loadSide(date.b_id);
    const sides = [A, B];
    const transcript: { speaker: 0 | 1; content: string }[] = [];
    const sideBModel = dateId.charCodeAt(0) % 2 === 0 ? MODELS.fastB : MODELS.fastC;

    for (let turn = 0; turn < PHASES.length; turn++) {
      const s = (turn % 2) as 0 | 1;
      const me = sides[s];
      const other = sides[1 - s];
      const phase = PHASES[turn];
      const history = transcript.map((m) => ({
        role: (m.speaker === s ? "assistant" : "user") as "assistant" | "user",
        content: m.content,
      }));
      if (history.length === 0) history.push({ role: "user", content: `(The date with ${firstName(other.person.name)} is starting. You speak first.)` });
      const content = await chatText({
        model: s === 0 ? MODELS.fast : sideBModel,
        system: `${personaPrompt(me.person, me.profile, other.person)}\n\nCurrent phase: ${phase.name}. Your goal for this message: ${phase.goal}\nReply with only your next message.`,
        messages: history,
        temperature: 0.9,
        maxTokens: 600,
      });
      const text = content.replace(/^["']|["']$/g, "").trim() || "…";
      transcript.push({ speaker: s, content: text });
      must(await db().from("date_messages").insert({ date_id: dateId, speaker_id: me.person.id, turn, phase: phase.name, content: text }));
    }

    await writeVerdicts(dateId, sides, transcript.map((m) => ({ speakerId: sides[m.speaker].person.id, content: m.content })));
    await db().from("dates").update({ status: "done", finished_at: new Date().toISOString() }).eq("id", dateId);
  } catch (e) {
    await db().from("dates").update({ status: "failed", error: (e as Error).message.slice(0, 500) }).eq("id", dateId);
    throw e;
  }
}

type Side = Awaited<ReturnType<typeof loadSide>>;

function verdictPrompt(me: Side, other: Side) {
  return `${personaPrompt(me.person, me.profile, other.person)}

The date is over. Write your PRIVATE verdict for ${firstName(me.person.name)}. ${firstName(other.person.name)} will never see it.
You are a tough, discerning matchmaker, not a polite guest. ${firstName(me.person.name)} goes on dates with ~30 people and needs a ranking that actually separates them.
- Judge ONLY against ${firstName(me.person.name)}'s specific needs, values, lifestyle and dealbreakers, using what was actually said on this date.
- Friendliness, mutual compliments and "we're both ambitious / love growth" are NOT evidence of fit: almost everyone in this pool is a driven founder or creator. Look for concrete differentiators: pace of life, family stage, where they live, overlapping hobbies, how they spend weekends, clashing values, attention to ${firstName(me.person.name)}'s needs.
- Calibration: 3-4 = poor fit, 5 = pleasant but nothing specific, 6 = some real overlap, 7 = strong fit on several needs, 8 = rare, 9-10 = exceptional (almost never).
- wantsSecondDate = true only for genuinely strong fits (fit 7+) with no dealbreaker. Most dates should be false.`;
}

export async function writeVerdicts(dateId: string, sides: Side[], transcript: { speakerId: string; content: string }[]) {
  const names = Object.fromEntries(sides.map((s) => [s.person.id, s.person.name]));
  const lines = transcript.map((m) => `${names[m.speakerId]}: ${m.content}`).join("\n");
  await Promise.all(sides.map(async (me, i) => {
    const other = sides[1 - i];
    const v = await chatJSON({
      model: i === 0 ? MODELS.smart : MODELS.smartB,
      system: verdictPrompt(me, other),
      user: `Transcript:\n${lines}`,
      schema: Verdict,
      temperature: 0.3,
      maxTokens: 1500,
    });
    const verdict = { ...v, wantsSecondDate: v.wantsSecondDate && v.fitScore >= 7 && !v.dealbreakerHit };
    must(await db().from("verdicts").upsert({ date_id: dateId, judge_id: me.person.id, about_id: other.person.id, data: verdict }));
  }));
}

/** Re-scores a finished date from its stored transcript (used when the verdict prompt changes). */
export async function rescoreDate(dateId: string) {
  const date = must(await db().from("dates").select("a_id,b_id").eq("id", dateId).single()) as { a_id: string; b_id: string };
  const msgs = must(await db().from("date_messages").select("speaker_id,content").eq("date_id", dateId).order("turn")) as { speaker_id: string; content: string }[];
  const sides = [await loadSide(date.a_id), await loadSide(date.b_id)];
  await writeVerdicts(dateId, sides, msgs.map((m) => ({ speakerId: m.speaker_id, content: m.content })));
}

/** Creates pending dates between one person and a list of others (alternating who opens). */
export async function ensureDates(personId: string, others: string[], round = 1) {
  const rows = others.map((o, i) => (i % 2 === 0 ? { a_id: personId, b_id: o, round } : { a_id: o, b_id: personId, round }));
  if (!rows.length) return [];
  const existing = must(await db().from("dates").select("id,a_id,b_id").eq("round", round).or(`a_id.eq.${personId},b_id.eq.${personId}`)) as { id: string; a_id: string; b_id: string }[];
  const key = (a: string, b: string) => [a, b].sort().join(":");
  const have = new Set(existing.map((d) => key(d.a_id, d.b_id)));
  const fresh = rows.filter((r) => !have.has(key(r.a_id, r.b_id)));
  if (fresh.length) must(await db().from("dates").insert(fresh));
  const all = must(await db().from("dates").select("id,a_id,b_id").eq("round", round).or(`a_id.eq.${personId},b_id.eq.${personId}`)) as { id: string; a_id: string; b_id: string }[];
  const wanted = new Set(others);
  return all.filter((d) => wanted.has(d.a_id === personId ? d.b_id : d.a_id));
}
