/* eslint-disable @typescript-eslint/no-explicit-any */
import { INSTAGRAM_ACTOR, LINKEDIN_ACTOR } from "./apify";
import { rehost } from "./images";
import { igPosts } from "./sources";
import { db, must } from "./supabase";

export async function createPerson(p: { name: string; linkedin_url: string; instagram_url: string; ig_username: string; is_seed: boolean }) {
  const existing = must(await db().from("people").select("id").eq("linkedin_url", p.linkedin_url).eq("ig_username", p.ig_username).maybeSingle()) as { id: string } | null;
  if (existing) return existing.id;
  const row = must(await db().from("people").insert({ ...p, status: "scraping" }).select("id").single()) as { id: string };
  return row.id;
}

/**
 * Saves raw Apify output for a person, rehosts their photos to Supabase Storage.
 * Returns base64 data URLs of post images so the vision model doesn't need to re-download.
 */
export async function storeScrape(personId: string, liRaw: any | null, igRaw: any | null, runIds: { li?: string; ig?: string } = {}) {
  const dataUrls: Record<string, string> = {};
  const liOk = !!liRaw && !liRaw.error && !!(liRaw.firstName || liRaw.publicIdentifier);
  // A private account still exposes its bio, name and profile photo publicly; posts stay hidden.
  const igOk = !!igRaw && !igRaw.error && !!igRaw.username;

  const images: { postId: string; url: string; caption?: string; postUrl: string }[] = [];
  if (igOk && !igRaw.private) {
    const posts = igPosts(igRaw).filter((p) => p.imageUrl).slice(0, 8);
    await Promise.all(posts.map(async (p) => {
      const r = await rehost(p.imageUrl, `${personId}/${p.id}.jpg`).catch(() => null);
      if (r) {
        images.push({ postId: p.id, url: r.publicUrl, caption: p.caption?.slice(0, 200), postUrl: p.url });
        dataUrls[p.id] = r.dataUrl;
      }
    }));
  }

  // With fewer than 3 post photos, the profile photos are the only visual signal left for the vision model.
  const igPic = igRaw?.profilePicUrlHD ?? igRaw?.profilePicUrl;
  const liImages: typeof images = [];
  if (images.length < 3) {
    const [ip, lp] = await Promise.all([
      igOk && igPic ? rehost(igPic, `${personId}/profile_pic.jpg`).catch(() => null) : null,
      liOk && liRaw.photo ? rehost(liRaw.photo, `${personId}/linkedin_photo.jpg`).catch(() => null) : null,
    ]);
    if (ip) {
      images.push({ postId: "profile_pic", url: ip.publicUrl, caption: "Instagram profile picture", postUrl: `https://www.instagram.com/${igRaw.username}/` });
      dataUrls.profile_pic = ip.dataUrl;
    }
    if (lp) {
      liImages.push({ postId: "linkedin_photo", url: lp.publicUrl, caption: "LinkedIn profile photo", postUrl: liRaw.linkedinUrl ?? "" });
      dataUrls.linkedin_photo = lp.dataUrl;
    }
  }

  const photoSrc = liOk && liRaw.photo ? liRaw.photo : igPic;
  const photo = await rehost(photoSrc, `${personId}/avatar.jpg`).catch(() => null)
    ?? (igOk && igPic ? await rehost(igPic, `${personId}/avatar.jpg`).catch(() => null) : null);

  must(await db().from("sources").upsert([
    {
      person_id: personId, kind: "linkedin", apify_actor: LINKEDIN_ACTOR, apify_run_id: runIds.li ?? null,
      status: liOk ? "done" : "failed", error: liOk ? null : liRaw?.error ?? "LinkedIn profile not returned", raw: liRaw, images: liImages,
    },
    {
      person_id: personId, kind: "instagram", apify_actor: INSTAGRAM_ACTOR, apify_run_id: runIds.ig ?? null,
      status: igOk ? "done" : "failed",
      error: !igOk ? "Instagram profile not returned" : igRaw.private ? "Private account: only bio and profile photo are visible" : null,
      raw: igRaw, images,
    },
  ], { onConflict: "person_id,kind" }));

  const name = liOk ? [liRaw.firstName, liRaw.lastName].filter(Boolean).join(" ") : igRaw?.fullName;
  await db().from("people").update({
    ...(name ? { name } : {}),
    headline: liOk ? liRaw.headline : igRaw?.biography?.slice(0, 140),
    location: liOk ? liRaw.location?.linkedinText ?? null : null,
    photo_url: photo?.publicUrl ?? null,
    status: liOk || igOk ? "scraped" : "failed",
    error: liOk || igOk ? null : "Neither source could be scraped",
  }).eq("id", personId);

  return { liOk, igOk, dataUrls };
}
