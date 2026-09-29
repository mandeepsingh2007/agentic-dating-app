import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { listSeedPeople } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function PeoplePage() {
  const people = await listSeedPeople();
  return (
    <div className="glow">
      <div className="mx-auto max-w-6xl px-5 py-12">
        <div className="text-xs uppercase tracking-[0.2em] text-gold">The pool</div>
        <h1 className="mt-1 font-serif text-5xl">{people.length} real people, {people.length} agents</h1>
        <p className="mt-3 max-w-2xl text-muted">
          Each person was found by us and scraped from exactly two sources: their public LinkedIn and their public Instagram (via Apify).
          An Analyst agent read everything, including their photos, and built the profile their dating agent now uses.
        </p>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {people.map((p) => (
            <Link key={p.id} href={`/people/${p.id}`} className="group rounded-2xl border border-line bg-card/50 p-5 transition hover:border-gold/50 hover:bg-card">
              <div className="flex items-center gap-4">
                <Avatar src={p.photo_url} name={p.name} size={64} />
                <div className="min-w-0">
                  <div className="font-serif text-xl group-hover:text-gold">{p.name}</div>
                  <div className="truncate text-xs text-muted">{p.profile?.location ?? p.location}</div>
                </div>
              </div>
              <p className="mt-3 line-clamp-2 text-sm text-foreground/85">{p.profile?.oneLiner ?? p.headline}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {(p.profile?.hobbies ?? []).slice(0, 3).map((h) => (
                  <span key={h.label} className="rounded-full border border-line px-2 py-0.5 text-[11px] text-muted">{h.label}</span>
                ))}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
