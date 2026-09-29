"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Avatar } from "./Avatar";
import type { ProfileT } from "@/lib/profile-schema";

type P = { id: string; name: string; photo_url: string | null };
type Step = "scrape" | "analyze" | "dates" | "rank" | "done" | "error";
type DateRow = { id: string; a: string; b: string; status: string; messages: number };
type Msg = { id: number; speaker_id: string; content: string; phase: string };
type Reading = {
  linkedin: { headline?: string; about?: string; experience: string[]; education: string[]; skills: string[] } | null;
  instagram: { username?: string; bio?: string; captions: { id: string; caption: string }[] } | null;
  photos: { postId: string; url: string; label?: string; scene?: string }[];
  names: { linkedin: string | null; instagram: string | null; match: boolean };
  igPrivate: boolean;
  igPosts: number;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function JoinPipeline({ personId, pool, seeking, gender }: { personId: string; pool: P[]; seeking?: string; gender?: string }) {
  const [step, setStep] = useState<Step>("scrape");
  const [error, setError] = useState("");
  const [me, setMe] = useState<P & { headline?: string } | null>(null);
  const [src, setSrc] = useState<{ linkedin: string; instagram: string }>({ linkedin: "running", instagram: "running" });
  const [profile, setProfile] = useState<ProfileT | null>(null);
  const [reading, setReading] = useState<Reading | null>(null);
  const [dates, setDates] = useState<DateRow[]>([]);
  const [spot, setSpot] = useState<{ id: string; messages: Msg[] } | null>(null);
  const [top, setTop] = useState<{ candidate_id: string; score: number; rank: number; mutual: boolean; reasons: { headline: string } | null; date_id: string }[]>([]);
  const started = useRef(false);
  const current = useRef<Step>("scrape");
  const [failedAt, setFailedAt] = useState<Step>("scrape");
  const go = (s: Step) => { current.current = s; setStep(s); };
  const byId = Object.fromEntries([...pool, ...(me ? [me] : [])].map((p) => [p.id, p]));

  async function refreshMe() {
    const r = await fetch(`/api/people/${personId}`, { cache: "no-store" });
    if (!r.ok) return null;
    const j = await r.json();
    setMe(j.person);
    if (j.profile) setProfile(j.profile);
    return j;
  }

  async function loadReading() {
    const r = await fetch(`/api/people/${personId}/reading`, { cache: "no-store" });
    if (r.ok) setReading(await r.json());
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      try {
        let info = await refreshMe();
        if (!info) throw new Error("Person not found");
        if (!info.profile) {
          go("scrape");
          for (;;) {
            const r = await fetch(`/api/people/${personId}/scrape`, { method: "POST" });
            const j = await r.json();
            if (!r.ok) throw new Error(j.error ?? "Scrape failed");
            setSrc({ linkedin: j.linkedin, instagram: j.instagram });
            if (j.done) break;
            await sleep(4000);
          }
          info = await refreshMe();
          if (info.person.status === "failed") throw new Error(info.person.error ?? "Could not scrape either profile. Is the Instagram public?");
          go("analyze");
          await loadReading();
          const a = await fetch(`/api/people/${personId}/analyze`, { method: "POST" });
          const aj = await a.json();
          if (!a.ok) throw new Error(aj.error ?? "Analysis failed");
          setProfile(aj.profile);
          await Promise.all([refreshMe(), loadReading()]);
        } else {
          const st = (k: string) => (info.sources as { kind: string; status: string }[]).find((s) => s.kind === k)?.status ?? "done";
          setSrc({ linkedin: st("linkedin"), instagram: st("instagram") });
          await loadReading();
        }

        go("dates");
        const d = await fetch(`/api/people/${personId}/dates`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ seeking, gender }),
        });
        const dj = await d.json();
        if (!d.ok) throw new Error(dj.error ?? "Could not start dates");
        if (!dj.dates.length) throw new Error("Nobody in the pool matches who you want to date (or who wants to date you).");
        const ids: string[] = dj.dates.map((x: { id: string }) => x.id);
        let i = 0;
        await Promise.all(Array.from({ length: 6 }, async () => {
          while (i < ids.length) {
            const id = ids[i++];
            await fetch(`/api/dates/${id}/run`, { method: "POST" }).catch(() => null);
          }
        }));
        const after = await fetch(`/api/date-night?person=${personId}`, { cache: "no-store" }).then((r) => r.json()).catch(() => null);
        const failed: string[] = (after?.dates ?? []).filter((x: DateRow) => x.status === "failed").map((x: DateRow) => x.id);
        await Promise.all(failed.map((id) => fetch(`/api/dates/${id}/run`, { method: "POST" }).catch(() => null)));

        go("rank");
        await fetch(`/api/people/${personId}/rank`, { method: "POST" });
        go("done");
      } catch (e) {
        setError((e as Error).message);
        setFailedAt(current.current);
        setStep("error");
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (step !== "dates" && step !== "rank" && step !== "done") return;
    const t = setInterval(async () => {
      const r = await fetch(`/api/date-night?person=${personId}`, { cache: "no-store" });
      if (!r.ok) return;
      const list: DateRow[] = (await r.json()).dates;
      setDates(list);
      const live = list.find((x) => x.status === "live" && x.messages > 0) ?? list.find((x) => x.status === "live");
      if (live) {
        const dr = await fetch(`/api/dates/${live.id}`, { cache: "no-store" });
        if (dr.ok) setSpot({ id: live.id, messages: (await dr.json()).messages });
      }
    }, 1500);
    return () => clearInterval(t);
  }, [step, personId]);

  useEffect(() => {
    if (step !== "done") return;
    fetch(`/api/people/${personId}/ranking`, { cache: "no-store" }).then((r) => r.json()).then((j) => setTop(j.ranking ?? []));
  }, [step, personId]);

  const doneCount = dates.filter((d) => d.status === "done").length;
  const steps: { key: Step; label: string; detail: string }[] = [
    { key: "scrape", label: "Scraping LinkedIn + Instagram", detail: `Apify · LinkedIn: ${src.linkedin} · Instagram: ${src.instagram}` },
    { key: "analyze", label: "Analyst agent is reading your profiles", detail: "Vision on your photos, then needs, hobbies, interests, values, dealbreakers" },
    { key: "dates", label: "Your agent is on dates", detail: dates.length ? `${doneCount}/${dates.length} dates finished` : "One date with every agent you'd both want to meet" },
    { key: "rank", label: "Ranking who fits you best", detail: "From both agents' private verdicts" },
  ];
  const order: Step[] = ["scrape", "analyze", "dates", "rank", "done"];
  const idx = order.indexOf(step === "error" ? failedAt : step);

  return (
    <div className="mx-auto max-w-5xl px-5 py-12">
      <div className="flex items-center gap-4">
        <Avatar src={me?.photo_url} name={me?.name ?? "You"} size={72} className="ring-2 ring-gold/40" />
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-gold">Your agent is being built live</div>
          <h1 className="font-serif text-4xl">{me?.name ?? "…"}</h1>
          {profile && <p className="font-serif italic text-foreground/80">{profile.oneLiner}</p>}
        </div>
      </div>

      <ol className="mt-8 space-y-3">
        {steps.map((s, i) => {
          const state = step === "error" && i === Math.max(0, idx) ? "error" : i < idx || step === "done" ? "done" : i === idx ? "active" : "todo";
          return (
            <li key={s.key} className={`flex items-center gap-4 rounded-xl border p-4 ${state === "active" ? "border-gold/50 bg-gold/5" : "border-line bg-card/40"}`}>
              <span className={`flex h-7 w-7 items-center justify-center rounded-full text-sm ${state === "done" ? "bg-sage/20 text-sage" : state === "active" ? "bg-gold/20 text-gold" : "bg-line text-muted"}`}>
                {state === "done" ? "✓" : state === "active" ? <span className="live-dot">●</span> : i + 1}
              </span>
              <div>
                <div className={state === "todo" ? "text-muted" : ""}>{s.label}</div>
                <div className="text-xs text-muted">{s.detail}</div>
              </div>
            </li>
          );
        })}
      </ol>
      {error && <p className="mt-4 rounded-xl border border-rose/40 bg-rose/10 p-4 text-sm text-rose">{error}</p>}
      {(src.instagram === "failed" || src.linkedin === "failed") && (
        <p className="mt-4 rounded-xl border border-gold/40 bg-gold/10 p-4 text-sm text-gold">
          {src.instagram === "failed" ? "Instagram" : "LinkedIn"} couldn&apos;t be read (private, empty or wrong link), so your agent only knows the other source.
          Make it public and submit the same links again to rebuild your agent.
        </p>
      )}

      {reading && (step === "analyze" || step === "scrape" || step === "error") && <ReadingPanel r={reading} live={step === "analyze"} />}

      {profile && (
        <div className="rise mt-8 grid gap-4 md:grid-cols-3">
          <Mini title="Needs in a partner" items={profile.needs.map((n) => n.label)} cls="text-rose" />
          <Mini title="Hobbies" items={profile.hobbies.map((n) => n.label)} cls="text-gold" />
          <Mini title="Values" items={profile.values.map((n) => n.label)} cls="text-sage" />
        </div>
      )}

      {spot && step === "dates" && (
        <div className="rise mt-8 rounded-2xl border border-rose/40 bg-card/60 p-5">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-rose"><span className="live-dot h-2 w-2 rounded-full bg-rose" /> Live date</div>
          <div className="mt-3 space-y-2">
            {spot.messages.slice(-3).map((m) => (
              <div key={m.id} className="flex gap-2 text-sm">
                <Avatar src={byId[m.speaker_id]?.photo_url} name={byId[m.speaker_id]?.name ?? "?"} size={26} />
                <div><span className="text-muted">{byId[m.speaker_id]?.name.split(" ")[0]}&apos;s agent · {m.phase}</span><div>{m.content}</div></div>
              </div>
            ))}
          </div>
          <Link href={`/dates/${spot.id}`} className="mt-3 inline-block text-xs text-gold">Open this date →</Link>
        </div>
      )}

      {dates.length > 0 && (
        <div className="mt-8 grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-6">
          {dates.map((d) => {
            const other = byId[d.a === personId ? d.b : d.a];
            if (!other) return null;
            return (
              <Link key={d.id} href={`/dates/${d.id}`} className={`flex items-center gap-2 rounded-lg border p-2 text-xs ${d.status === "live" ? "border-rose/50" : d.status === "done" ? "border-sage/40" : "border-line"}`}>
                <Avatar src={other.photo_url} name={other.name} size={24} />
                <span className="truncate">{other.name.split(" ")[0]}</span>
                <span className={`ml-auto ${d.status === "done" ? "text-sage" : d.status === "live" ? "text-rose" : "text-muted"}`}>{d.status === "done" ? "✓" : d.status === "live" ? `${d.messages}/8` : "·"}</span>
              </Link>
            );
          })}
        </div>
      )}

      {step === "done" && (
        <div className="rise mt-10 rounded-2xl border border-gold/40 bg-card/70 p-6">
          <h2 className="font-serif text-3xl">Your top matches</h2>
          <ol className="mt-4 space-y-2">
            {top.slice(0, 5).map((r) => {
              const c = byId[r.candidate_id];
              if (!c) return null;
              return (
                <li key={r.candidate_id}>
                  <Link href={`/dates/${r.date_id}`} className="flex items-center gap-3 rounded-xl p-2 hover:bg-ink/60">
                    <span className="w-5 font-serif text-gold">{r.rank}</span>
                    <Avatar src={c.photo_url} name={c.name} size={40} />
                    <div className="min-w-0 flex-1">
                      <div>{c.name} {r.mutual && <span className="text-rose">♥ mutual</span>}</div>
                      <div className="truncate text-xs text-muted">{r.reasons?.headline}</div>
                    </div>
                    <span className="tabular-nums">{Number(r.score).toFixed(1)}</span>
                  </Link>
                </li>
              );
            })}
          </ol>
          <Link href={`/people/${personId}`} className="mt-5 inline-block rounded-full bg-gold px-5 py-2 font-medium text-ink">See your full profile & ranking →</Link>
        </div>
      )}
    </div>
  );
}

function ReadingPanel({ r, live }: { r: Reading; live: boolean }) {
  const li = r.linkedin;
  const ig = r.instagram;
  const lines: { src: "linkedin" | "instagram"; label: string; text: string }[] = [
    ...(li?.headline ? [{ src: "linkedin" as const, label: "headline", text: li.headline }] : []),
    ...(li?.about ? [{ src: "linkedin" as const, label: "about", text: li.about }] : []),
    ...(li?.experience ?? []).map((t) => ({ src: "linkedin" as const, label: "experience", text: t })),
    ...(li?.education ?? []).map((t) => ({ src: "linkedin" as const, label: "education", text: t })),
    ...(li?.skills.length ? [{ src: "linkedin" as const, label: "skills", text: li.skills.join(", ") }] : []),
    ...(ig?.bio ? [{ src: "instagram" as const, label: "bio", text: ig.bio }] : []),
    ...(ig?.captions ?? []).map((c) => ({ src: "instagram" as const, label: `post ${c.id}`, text: c.caption })),
  ];
  return (
    <div className="rise mt-8 rounded-2xl border border-line bg-card/50 p-5">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-gold">
        {live && <span className="live-dot h-2 w-2 rounded-full bg-gold" />}
        {live ? "The Analyst agent is reading" : "What the Analyst agent read"}
      </div>
      {!r.names.match && (
        <p className="mt-3 rounded-lg border border-rose/40 bg-rose/10 px-3 py-2 text-xs text-rose">
          Heads up: LinkedIn says &ldquo;{r.names.linkedin}&rdquo; but Instagram says &ldquo;{r.names.instagram}&rdquo;. These may not be the same person.
        </p>
      )}
      {ig && (r.igPrivate || r.igPosts === 0) && (
        <p className="mt-3 rounded-lg border border-gold/40 bg-gold/10 px-3 py-2 text-xs text-gold">
          {r.igPrivate ? "Your Instagram is private" : "Your Instagram has no posts yet"}, so the agent can only read your bio and profile photos.
          Post a few public photos for a richer profile.
        </p>
      )}
      <div className="mt-4 grid gap-5 md:grid-cols-2">
        <ul className="max-h-80 space-y-2 overflow-y-auto pr-2 text-sm">
          {lines.map((l, i) => (
            <li key={i} className="rise" style={{ animationDelay: `${i * 180}ms` }}>
              <span className={`mr-2 text-[11px] uppercase tracking-wider ${l.src === "linkedin" ? "text-sky-400" : "text-pink-400"}`}>{l.src === "linkedin" ? "in" : "ig"} · {l.label}</span>
              <span className="text-foreground/85">{l.text}</span>
            </li>
          ))}
        </ul>
        <div className="grid grid-cols-3 content-start gap-2">
          {r.photos.map((p, i) => (
            <div key={p.postId} className="rise" style={{ animationDelay: `${(lines.length + i) * 180}ms` }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt={p.scene ?? "Instagram post"} className={`aspect-square w-full rounded-lg object-cover ${live && !p.scene ? "animate-pulse" : ""}`} />
              {(p.postId === "profile_pic" || p.postId === "linkedin_photo") && <div className="mt-1 text-[10px] uppercase tracking-wider text-gold/80">{p.label}</div>}
              <div className="mt-1 line-clamp-3 text-[11px] text-muted">{p.scene ?? (live ? "vision model looking…" : "")}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Mini({ title, items, cls }: { title: string; items: string[]; cls: string }) {
  return (
    <div className="rounded-2xl border border-line bg-card/50 p-4">
      <div className="text-xs uppercase tracking-wider text-muted">{title}</div>
      <div className="mt-2 flex flex-wrap gap-1.5">{items.map((x) => <span key={x} className={`rounded-full border border-line px-2 py-0.5 text-xs ${cls}`}>{x}</span>)}</div>
    </div>
  );
}
