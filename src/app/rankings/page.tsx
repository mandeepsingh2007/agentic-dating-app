import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { db, must } from "@/lib/supabase";
import type { PersonRow, RankingRow } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function RankingsPage() {
  const people = must(await db().from("people").select("id,name,photo_url,headline,is_seed").eq("is_seed", true).order("name")) as PersonRow[];
  const rows = must(await db().from("rankings").select("*").order("rank").limit(3000)) as RankingRow[];
  const byId = new Map(people.map((p) => [p.id, p]));
  const byPerson = new Map<string, RankingRow[]>();
  for (const r of rows) {
    if (!byId.has(r.person_id)) continue;
    byPerson.set(r.person_id, [...(byPerson.get(r.person_id) ?? []), r]);
  }

  const pairKey = (a: string, b: string) => [a, b].sort().join(":");
  const pairs = new Map<string, { a: string; b: string; score: number; date: string | null }>();
  for (const r of rows) {
    if (!r.mutual || !byId.has(r.person_id) || !byId.has(r.candidate_id)) continue;
    const back = rows.find((x) => x.person_id === r.candidate_id && x.candidate_id === r.person_id);
    if (!back) continue;
    const k = pairKey(r.person_id, r.candidate_id);
    if (!pairs.has(k)) pairs.set(k, { a: r.person_id, b: r.candidate_id, score: Number(r.score) + Number(back.score), date: r.date_id });
  }
  const topPairs = [...pairs.values()].sort((x, y) => y.score - x.score).slice(0, 6);

  return (
    <div className="glow">
      <div className="mx-auto max-w-6xl px-5 py-12">
        <div className="text-xs uppercase tracking-[0.2em] text-gold">Rankings</div>
        <h1 className="mt-1 font-serif text-5xl">Who fits whom best</h1>
        <p className="mt-3 max-w-3xl text-muted">
          For every person, their agent&apos;s private verdict of each date (fit 40%, values 25%, chemistry 20%, lifestyle 15%) counts 70%, the other side&apos;s verdict counts 30%.
          A dealbreaker costs 3 points; a mutual &ldquo;second date&rdquo; adds 0.5.
        </p>

        {topPairs.length > 0 && (
          <section className="mt-10">
            <h2 className="font-serif text-2xl">Strongest mutual matches</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {topPairs.map((p) => {
                const a = byId.get(p.a)!, b = byId.get(p.b)!;
                return (
                  <Link key={p.a + p.b} href={p.date ? `/dates/${p.date}` : "#"} className="flex items-center gap-3 rounded-2xl border border-rose/30 bg-rose/5 p-4 hover:border-rose/60">
                    <Avatar src={a.photo_url} name={a.name} size={48} />
                    <span className="font-serif text-2xl text-rose">♥</span>
                    <Avatar src={b.photo_url} name={b.name} size={48} />
                    <div className="min-w-0 text-sm">
                      <div className="truncate">{a.name.split(" ")[0]} & {b.name.split(" ")[0]}</div>
                      <div className="text-xs text-muted">both want a second date · {(p.score / 2).toFixed(1)}</div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        <section className="mt-12 space-y-3">
          <h2 className="font-serif text-2xl">Every person&apos;s top 5</h2>
          {people.map((p) => {
            const list = (byPerson.get(p.id) ?? []).slice(0, 5);
            return (
              <div key={p.id} className="flex flex-col gap-3 rounded-2xl border border-line bg-card/50 p-4 md:flex-row md:items-center">
                <Link href={`/people/${p.id}`} className="flex w-56 shrink-0 items-center gap-3 hover:text-gold">
                  <Avatar src={p.photo_url} name={p.name} size={44} />
                  <span className="font-serif text-lg">{p.name}</span>
                </Link>
                <div className="flex flex-1 flex-wrap gap-2">
                  {list.length === 0 && <span className="text-sm text-muted">dates in progress…</span>}
                  {list.map((r) => {
                    const c = byId.get(r.candidate_id);
                    if (!c) return null;
                    return (
                      <Link key={r.candidate_id} href={r.date_id ? `/dates/${r.date_id}` : `/people/${c.id}`} title={r.reasons?.headline} className="flex items-center gap-2 rounded-full border border-line bg-ink/60 py-1 pl-1 pr-3 text-sm hover:border-gold/60">
                        <span className="w-4 text-center font-serif text-gold">{r.rank}</span>
                        <Avatar src={c.photo_url} name={c.name} size={26} />
                        <span>{c.name.split(" ")[0]}</span>
                        <span className="text-xs tabular-nums text-muted">{Number(r.score).toFixed(1)}</span>
                        {r.mutual && <span className="text-rose">♥</span>}
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </section>
      </div>
    </div>
  );
}
