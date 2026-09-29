"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Avatar } from "./Avatar";

type P = { id: string; name: string; photo_url: string | null };
type D = { id: string; a: string; b: string; status: string; messages: number };

async function runWithLimit(ids: string[], n: number, onDone: () => void) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < ids.length) {
      const id = ids[i++];
      await fetch(`/api/dates/${id}/run`, { method: "POST" }).catch(() => null);
      onDone();
    }
  }));
}

export function DateNight({ people, personId }: { people: P[]; personId?: string }) {
  const [dates, setDates] = useState<D[]>([]);
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState("");
  const byId = useMemo(() => Object.fromEntries(people.map((p) => [p.id, p])), [people]);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const res = await fetch(`/api/date-night${personId ? `?person=${personId}` : ""}`, { cache: "no-store" });
      if (res.ok && alive) setDates((await res.json()).dates);
    };
    load();
    const t = setInterval(load, 1500);
    return () => { alive = false; clearInterval(t); };
  }, [personId]);

  const visible = dates.filter((d) => byId[d.a] && byId[d.b]);
  const order: Record<string, number> = { live: 0, done: 1, pending: 2, failed: 3 };
  const sorted = [...visible].sort((x, y) => order[x.status] - order[y.status]);
  const count = (s: string) => visible.filter((d) => d.status === s).length;
  const focus = personId ? byId[personId] : null;

  async function admin(action: string, count?: number) {
    const res = await fetch("/api/admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ secret, action, count }) });
    const j = await res.json();
    if (!res.ok) throw new Error(j.error);
    return j;
  }

  async function replay(action: "replay" | "pool") {
    try {
      setBusy(action === "replay" ? "Resetting dates…" : "Preparing pool…");
      const { ids } = await admin(action, 24);
      let n = 0;
      setBusy(`Running ${ids.length} dates live…`);
      await runWithLimit(ids, 8, () => setBusy(`Running dates live… ${++n}/${ids.length}`));
      setBusy("Computing rankings…");
      await admin("rank");
      setBusy("Done. Rankings updated.");
    } catch (e) {
      setBusy(`Error: ${(e as Error).message}`);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-5 py-12">
      <div className="text-xs uppercase tracking-[0.2em] text-gold">Date Night</div>
      <h1 className="mt-1 font-serif text-5xl">{focus ? `${focus.name}'s dates` : "Every agent dates every agent"}</h1>
      <p className="mt-3 max-w-2xl text-muted">
        Each date is 8 messages across 4 phases (icebreaker, lifestyle, values, dealbreakers). Each message is its own LLM call made by an agent that only knows its own person.
        Afterwards both agents write a private verdict. Click any date to read it.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-3 text-sm">
        <Stat label="live now" v={count("live")} cls="text-rose" dot />
        <Stat label="finished" v={count("done")} cls="text-sage" />
        <Stat label="waiting" v={count("pending")} cls="text-muted" />
        {count("failed") > 0 && <Stat label="failed" v={count("failed")} cls="text-rose" />}
        {focus && <Link href="/date-night" className="ml-auto text-muted hover:text-foreground">Show all dates →</Link>}
      </div>

      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {sorted.slice(0, 240).map((d) => {
          const a = byId[d.a], b = byId[d.b];
          return (
            <Link key={d.id} href={`/dates/${d.id}`} className={`rounded-xl border p-3 transition hover:border-gold/60 ${d.status === "live" ? "border-rose/50 bg-rose/5" : "border-line bg-card/50"}`}>
              <div className="flex items-center">
                <Avatar src={a.photo_url} name={a.name} size={34} />
                <Avatar src={b.photo_url} name={b.name} size={34} className="-ml-2" />
                <div className="ml-2 min-w-0 text-xs leading-tight">
                  <div className="truncate">{a.name.split(" ")[0]} × {b.name.split(" ")[0]}</div>
                  <div className={d.status === "live" ? "text-rose" : d.status === "done" ? "text-sage" : "text-muted"}>
                    {d.status === "live" ? <><span className="live-dot mr-1 inline-block h-1.5 w-1.5 rounded-full bg-rose" />live · msg {d.messages}/8</> : d.status}
                  </div>
                </div>
              </div>
              <div className="mt-2 h-1 rounded-full bg-line">
                <div className={`h-full rounded-full transition-all ${d.status === "done" ? "bg-sage" : "bg-rose"}`} style={{ width: `${d.status === "done" ? 100 : (d.messages / 8) * 100}%` }} />
              </div>
            </Link>
          );
        })}
      </div>
      {sorted.length > 240 && <p className="mt-4 text-center text-xs text-muted">Showing 240 of {sorted.length} dates.</p>}

      {!personId && (
        <details className="mt-12 rounded-xl border border-line p-4 text-sm text-muted">
          <summary className="cursor-pointer">Admin: run dates live from this browser</summary>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input value={secret} onChange={(e) => setSecret(e.target.value)} type="password" placeholder="admin secret" className="rounded-lg border border-line bg-ink px-3 py-1.5 text-foreground" />
            <button onClick={() => replay("replay")} className="rounded-full bg-gold px-4 py-1.5 font-medium text-ink">Replay 24 dates live</button>
            <button onClick={() => replay("pool")} className="rounded-full border border-line px-4 py-1.5">Run all missing pool dates</button>
            <span>{busy}</span>
          </div>
        </details>
      )}
    </div>
  );
}

function Stat({ label, v, cls, dot }: { label: string; v: number; cls: string; dot?: boolean }) {
  return (
    <span className="flex items-center gap-2 rounded-full border border-line px-3 py-1">
      {dot && v > 0 && <span className="live-dot h-2 w-2 rounded-full bg-rose" />}
      <span className={`font-serif text-lg ${cls}`}>{v}</span> <span className="text-muted">{label}</span>
    </span>
  );
}
