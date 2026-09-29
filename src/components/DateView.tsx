"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Avatar } from "./Avatar";
import type { getDate } from "@/lib/queries";

type DateData = NonNullable<Awaited<ReturnType<typeof getDate>>>;

export function DateView({ initial }: { initial: DateData }) {
  const [data, setData] = useState(initial);
  const bottom = useRef<HTMLDivElement>(null);
  const finished = data.date.status === "done" && data.verdicts.length >= 2;

  useEffect(() => {
    if (finished) return;
    const t = setInterval(async () => {
      const res = await fetch(`/api/dates/${initial.date.id}`, { cache: "no-store" });
      if (res.ok) setData(await res.json());
    }, 1200);
    return () => clearInterval(t);
  }, [finished, initial.date.id]);

  useEffect(() => {
    if (!finished) bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [data.messages.length, finished]);

  const byId = Object.fromEntries(data.people.map((p) => [p.id, p]));
  const a = byId[data.date.a_id];
  const b = byId[data.date.b_id];
  if (!a || !b) return null;

  return (
    <div className="mx-auto max-w-5xl px-5 py-10">
      <div className="flex items-center justify-center gap-6">
        <PersonHead p={a} />
        <div className="text-center">
          <div className="font-serif text-3xl text-gold">×</div>
          <StatusPill status={data.date.status} />
        </div>
        <PersonHead p={b} />
      </div>
      <p className="mt-4 text-center text-xs text-muted">
        Two separate AI agents. Each one only knows its own person&apos;s profile. Every message is a separate LLM call.
      </p>

      <div className="mx-auto mt-8 max-w-3xl space-y-3">
        {data.messages.map((m, i) => {
          const left = m.speaker_id === a.id;
          const who = byId[m.speaker_id];
          const showPhase = m.phase !== data.messages[i - 1]?.phase;
          return (
            <div key={m.id} className="rise">
              {showPhase && (
                <div className="my-4 flex items-center gap-3 text-[11px] uppercase tracking-[0.2em] text-muted">
                  <div className="h-px flex-1 bg-line" />{m.phase}<div className="h-px flex-1 bg-line" />
                </div>
              )}
              <div className={`flex items-end gap-2 ${left ? "" : "flex-row-reverse"}`}>
                <Avatar src={who?.photo_url} name={who?.name ?? "?"} size={32} />
                <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed ${left ? "rounded-bl-sm bg-card" : "rounded-br-sm bg-gold/15"}`}>
                  <div className="mb-0.5 text-[11px] text-muted">{who?.name.split(" ")[0]}&apos;s agent</div>
                  {m.content}
                </div>
              </div>
            </div>
          );
        })}
        {!finished && data.date.status !== "failed" && (
          <div className="flex items-center gap-2 pl-10 text-sm text-muted">
            <span className="live-dot h-2 w-2 rounded-full bg-rose" />
            {data.messages.length < 8 ? "agent is typing…" : "agents are writing their private verdicts…"}
          </div>
        )}
        <div ref={bottom} />
      </div>

      {data.verdicts.length > 0 && (
        <div className="mt-12">
          <h2 className="text-center font-serif text-3xl">Private verdicts</h2>
          <p className="mt-1 text-center text-xs text-muted">Written separately by each agent after the date. The other side never sees it.</p>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {[a, b].map((p) => {
              const v = data.verdicts.find((x) => x.judge_id === p.id)?.data;
              const other = p.id === a.id ? b : a;
              if (!v) return <div key={p.id} className="rounded-2xl border border-line p-5 text-sm text-muted">Waiting for {p.name.split(" ")[0]}&apos;s agent…</div>;
              return (
                <div key={p.id} className="rise rounded-2xl border border-line bg-card/60 p-5">
                  <div className="flex items-center gap-3">
                    <Avatar src={p.photo_url} name={p.name} size={40} />
                    <div>
                      <div className="text-sm text-muted">{p.name.split(" ")[0]}&apos;s agent on {other.name.split(" ")[0]}</div>
                      <div className="font-serif text-lg">&ldquo;{v.headline}&rdquo;</div>
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-4 gap-2 text-center">
                    <Score k="Fit" v={v.fitScore} /><Score k="Chemistry" v={v.chemistry} /><Score k="Values" v={v.valuesAlignment} /><Score k="Lifestyle" v={v.lifestyleFit} />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <span className={`rounded-full px-2 py-0.5 ${v.wantsSecondDate ? "bg-sage/20 text-sage" : "bg-line text-muted"}`}>{v.wantsSecondDate ? "wants a second date" : "no second date"}</span>
                    {v.dealbreakerHit && <span className="rounded-full bg-rose/20 px-2 py-0.5 text-rose">dealbreaker hit</span>}
                  </div>
                  <ul className="mt-3 space-y-1 text-sm">{v.topReasons.map((r) => <li key={r}>✦ {r}</li>)}</ul>
                  {v.concerns.length > 0 && <ul className="mt-2 space-y-1 text-sm text-muted">{v.concerns.map((r) => <li key={r}>⚠ {r}</li>)}</ul>}
                  {v.evidence.length > 0 && (
                    <div className="mt-3 space-y-1.5 border-t border-line pt-3 text-xs">
                      {v.evidence.map((e, i) => (
                        <div key={i}><span className="italic text-foreground/80">&ldquo;{e.quoteFromDate}&rdquo;</span> <span className="text-muted">→ {e.linkedToMyNeed}</span></div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function PersonHead({ p }: { p: { id: string; name: string; photo_url: string | null } }) {
  return (
    <Link href={`/people/${p.id}`} className="flex flex-col items-center gap-2 hover:text-gold">
      <Avatar src={p.photo_url} name={p.name} size={84} className="ring-2 ring-gold/30" />
      <span className="font-serif text-lg">{p.name}</span>
    </Link>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = { live: "bg-rose/20 text-rose", done: "bg-sage/20 text-sage", pending: "bg-line text-muted", failed: "bg-rose/20 text-rose" };
  return (
    <span className={`mt-1 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] uppercase tracking-wider ${map[status] ?? ""}`}>
      {status === "live" && <span className="live-dot h-1.5 w-1.5 rounded-full bg-rose" />}
      {status}
    </span>
  );
}

function Score({ k, v }: { k: string; v: number }) {
  return (
    <div className="rounded-lg bg-ink/60 py-2">
      <div className="font-serif text-xl">{v}</div>
      <div className="text-[10px] uppercase tracking-wider text-muted">{k}</div>
    </div>
  );
}
