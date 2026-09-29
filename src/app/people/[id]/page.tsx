/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { InsightChip, type ImageMap } from "@/components/InsightChip";
import { getPerson, getRanking, listPersonDates } from "@/lib/queries";
import type { InsightT } from "@/lib/profile-schema";
import { seekingOf } from "@/lib/match";

export const dynamic = "force-dynamic";

export default async function PersonPage(props: PageProps<"/people/[id]">) {
  const { id } = await props.params;
  const data = await getPerson(id);
  if (!data) notFound();
  const { person, profile, sources, photoNotes } = data;
  const [ranking, dates] = await Promise.all([getRanking(id), listPersonDates(id)]);
  const li = sources.find((s) => s.kind === "linkedin");
  const ig = sources.find((s) => s.kind === "instagram");
  const images: ImageMap = Object.fromEntries((ig?.images ?? []).map((i) => [i.postId, i]));
  const notes = new Map((photoNotes?.photos ?? []).map((p) => [p.postId, p]));
  const doneDates = dates.filter((d) => d.status === "done").length;

  return (
    <div className="glow">
      <div className="mx-auto max-w-6xl px-5 py-10">
        <Link href="/people" className="text-sm text-muted hover:text-foreground">← All people</Link>

        <section className="mt-6 flex flex-col gap-6 md:flex-row md:items-center">
          <Avatar src={person.photo_url} name={person.name} size={132} className="ring-2 ring-gold/40" />
          <div className="min-w-0 flex-1">
            <div className="text-xs uppercase tracking-[0.2em] text-gold">Profile built by the Analyst agent</div>
            <h1 className="mt-1 font-serif text-4xl md:text-5xl">{person.name}</h1>
            {profile && <p className="mt-2 font-serif text-xl italic text-foreground/85">{profile.oneLiner}</p>}
            <p className="mt-2 text-sm text-muted">{[person.headline, profile?.location].filter(Boolean).join(" · ")}</p>
            <div className="mt-4 flex flex-wrap gap-2 text-xs">
              <SourceBadge label="LinkedIn" href={person.linkedin_url} status={li?.status} detail={li?.status === "done" ? "profile, experience, education, skills" : li?.error} color="text-sky-400" />
              <SourceBadge label="Instagram" href={person.instagram_url} status={ig?.status} detail={ig?.status === "done" ? `bio + ${(ig.raw as { latestPosts?: unknown[] })?.latestPosts?.length ?? 0} posts, ${ig.images?.length ?? 0} photos analysed` : ig?.error} color="text-pink-400" />
              <span className="rounded-full border border-line px-3 py-1 text-muted">{doneDates} dates completed</span>
              {profile?.gender && (
                <span title={profile.gender.evidence} className="rounded-full border border-line px-3 py-1 text-muted">
                  {profile.gender.gender === "unknown" ? "gender not stated" : profile.gender.gender} · dates {seekingOf(profile)}
                  {!profile.seeking && person.is_seed && <span className="text-muted/70"> (default)</span>}
                </span>
              )}
            </div>
          </div>
        </section>

        {!profile ? (
          <p className="mt-10 text-muted">This profile is still being analysed. Status: {person.status}</p>
        ) : (
          <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_340px]">
            <div className="space-y-8">
              <Card title="Who they are">
                <p className="leading-relaxed text-foreground/90">{profile.summary}</p>
                <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                  <Fact k="Career now" v={profile.career.current} />
                  <Fact k="Trajectory" v={profile.career.trajectory} />
                  <Fact k="Work style" v={profile.career.workStyle} />
                  <Fact k="Ambition" v={"●".repeat(Math.round(profile.career.ambition)) + "○".repeat(5 - Math.round(profile.career.ambition))} />
                  {profile.education.length > 0 && <Fact k="Education" v={profile.education.join(" · ")} />}
                  <Fact k="Communication" v={profile.communicationStyle} />
                </div>
              </Card>

              {(ig?.images?.length ?? 0) > 0 && (
                <Card title="What their Instagram shows" subtitle="Photos rehosted from their public Instagram, described by a vision model">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {ig!.images!.slice(0, 6).map((img) => {
                      const n = notes.get(img.postId);
                      return (
                        <a key={img.postId} href={img.postUrl} target="_blank" rel="noreferrer" className="group relative overflow-hidden rounded-xl border border-line">
                          <img src={img.url} alt="" className="aspect-square w-full object-cover transition group-hover:scale-105" />
                          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent p-2 text-[11px] leading-snug">
                            {n ? <>{n.scene}{n.activities.length ? <span className="text-gold"> · {n.activities.slice(0, 2).join(", ")}</span> : null}</> : img.caption?.slice(0, 80)}
                          </div>
                        </a>
                      );
                    })}
                  </div>
                </Card>
              )}

              <div className="grid gap-8 md:grid-cols-2">
                <InsightList title="What they need in a partner" items={profile.needs} images={images} tone="rose" />
                <InsightList title="Hobbies" items={profile.hobbies} images={images} />
                <InsightList title="Interests" items={profile.interests} images={images} />
                <InsightList title="Values" items={profile.values} images={images} />
                <InsightList title="Lifestyle" items={profile.lifestyle} images={images} tone="sage" />
                <InsightList title="Likely dealbreakers" items={profile.dealbreakers} images={images} tone="rose" />
              </div>
              <p className="-mt-4 text-xs text-muted">Tap any tag to see the exact LinkedIn field or Instagram post it came from, plus the agent&apos;s confidence.</p>

              <Card title="Personality read">
                <div className="space-y-3">
                  {profile.personality.map((p) => (
                    <div key={p.trait}>
                      <div className="flex justify-between text-sm"><span>{p.trait}</span><span className="text-muted">{p.score}/5</span></div>
                      <div className="mt-1 h-1.5 rounded-full bg-line"><div className="h-full rounded-full bg-gold" style={{ width: `${(p.score / 5) * 100}%` }} /></div>
                      <p className="mt-1 text-xs text-muted">{p.why}</p>
                    </div>
                  ))}
                </div>
              </Card>

              <div className="grid gap-8 md:grid-cols-2">
                <Card title="Green flags"><ul className="space-y-1.5 text-sm">{profile.greenFlags.map((g) => <li key={g}>✦ {g}</li>)}</ul></Card>
                <Card title="Their agent would open with"><ul className="space-y-1.5 text-sm">{profile.conversationStarters.map((g) => <li key={g}>“{g}”</li>)}</ul></Card>
              </div>
              <Card title="Ideal date"><p className="font-serif text-lg italic">{profile.idealDate}</p></Card>
            </div>

            <aside className="space-y-4">
              <div className="sticky top-20 rounded-2xl border border-line bg-card/70 p-5">
                <h2 className="font-serif text-2xl">Who fits {person.name.split(" ")[0]} best</h2>
                <p className="mt-1 text-xs text-muted">Ranked from both agents&apos; private verdicts after each date.</p>
                {ranking.length === 0 ? (
                  <p className="mt-4 text-sm text-muted">Dates still in progress…</p>
                ) : (
                  <ol className="mt-4 space-y-2">
                    {ranking.slice(0, 10).map((r) => (
                      <li key={r.candidate_id}>
                        <Link href={r.date_id ? `/dates/${r.date_id}` : `/people/${r.candidate_id}`} className="flex items-center gap-3 rounded-xl p-2 hover:bg-ink/60">
                          <span className="w-5 text-right font-serif text-gold">{r.rank}</span>
                          <Avatar src={r.candidate.photo_url} name={r.candidate.name} size={36} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 text-sm font-medium">
                              <span className="truncate">{r.candidate.name}</span>
                              {r.mutual && <span className="rounded-full bg-rose/20 px-1.5 text-[10px] text-rose">mutual</span>}
                            </div>
                            <div className="truncate text-[11px] text-muted">{r.reasons?.headline}</div>
                          </div>
                          <span className="text-sm tabular-nums text-foreground/80">{Number(r.score).toFixed(1)}</span>
                        </Link>
                      </li>
                    ))}
                  </ol>
                )}
                <Link href={`/date-night?person=${person.id}`} className="mt-4 block rounded-full border border-line py-2 text-center text-sm hover:border-gold/60">
                  Watch {person.name.split(" ")[0]}&apos;s dates →
                </Link>
              </div>
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}

function SourceBadge({ label, href, status, detail, color }: { label: string; href: string; status?: string; detail?: string | null; color: string }) {
  const ok = status === "done";
  return (
    <a href={href} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-full border border-line px-3 py-1 hover:border-gold/60">
      <span className={ok ? "text-sage" : "text-rose"}>{ok ? "✓" : "✕"}</span>
      <span className={color}>{label}</span>
      {detail && <span className="text-muted">· {detail}</span>}
    </a>
  );
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-card/50 p-5">
      <h2 className="font-serif text-2xl">{title}</h2>
      {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Fact({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-muted">{k}</div>
      <div className="text-foreground/90">{v}</div>
    </div>
  );
}

function InsightList({ title, items, images, tone }: { title: string; items: InsightT[]; images: ImageMap; tone?: "gold" | "rose" | "sage" }) {
  return (
    <section>
      <h2 className="mb-3 font-serif text-xl">{title}</h2>
      <div className="space-y-2">
        {items.map((it) => <InsightChip key={it.label} insight={it} images={images} tone={tone} />)}
      </div>
    </section>
  );
}
