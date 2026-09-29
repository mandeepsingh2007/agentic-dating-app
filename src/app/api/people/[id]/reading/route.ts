import { NextResponse } from "next/server";
import { cleanInstagram, cleanLinkedIn } from "@/lib/sources";
import { db } from "@/lib/supabase";

/** What the Analyst agent reads: the scraped LinkedIn + Instagram, plus its photo descriptions once written. */
export async function GET(_req: Request, ctx: RouteContext<"/api/people/[id]/reading">) {
  const { id } = await ctx.params;
  const [sources, profile] = await Promise.all([
    db().from("sources").select("kind,raw,images").eq("person_id", id),
    db().from("profiles").select("photo_notes").eq("person_id", id).maybeSingle(),
  ]);
  const li = sources.data?.find((s) => s.kind === "linkedin");
  const ig = sources.data?.find((s) => s.kind === "instagram");
  const l = cleanLinkedIn(li?.raw);
  const i = cleanInstagram(ig?.raw);
  type Img = { postId: string; url: string; caption?: string };
  const images = [...((ig?.images ?? []) as Img[]), ...((li?.images ?? []) as Img[])].slice(0, 6);
  const notes = (profile.data?.photo_notes?.photos ?? []) as { postId: string; scene: string }[];
  const tokens = (s?: string) => new Set((s ?? "").toLowerCase().normalize("NFKD").replace(/[^a-z\s]/g, " ").split(/\s+/).filter((w) => w.length > 2));
  const liNames = tokens(l?.name);
  const igNames = new Set([...tokens(i?.fullName), ...tokens(i?.username?.replace(/[._\d]+/g, " "))]);
  const namesMatch = !l || !i || liNames.size === 0 || igNames.size === 0 || [...liNames].some((w) => igNames.has(w));
  return NextResponse.json({
    names: { linkedin: l?.name ?? null, instagram: i?.fullName || i?.username || null, match: namesMatch },
    igPrivate: !!(ig?.raw as { private?: boolean } | null)?.private,
    igPosts: i?.postsCount ?? 0,
    linkedin: l && {
      headline: l.headline,
      about: l.about?.slice(0, 280),
      experience: l.experience.slice(0, 4).map((e: { title?: string; company?: string; period?: string }) => [e.title, e.company, e.period].filter(Boolean).join(" · ")),
      education: l.education.slice(0, 2).map((e: { school?: string; degree?: string }) => [e.degree, e.school].filter(Boolean).join(", ")),
      skills: l.skills.slice(0, 10),
    },
    instagram: i && {
      username: i.username,
      bio: i.bio,
      captions: i.posts.filter((p) => p.caption).slice(0, 4).map((p) => ({ id: p.id, caption: p.caption!.slice(0, 160) })),
    },
    photos: images.map((im) => ({ postId: im.postId, url: im.url, label: im.caption, scene: notes.find((n) => n.postId === im.postId)?.scene })),
  });
}
