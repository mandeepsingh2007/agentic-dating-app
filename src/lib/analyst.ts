import { chatJSON, MODELS } from "./llm";
import { cleanInstagram, cleanLinkedIn } from "./sources";
import { Profile, PhotoNotes, type ProfileT, type PhotoNotesT } from "./profile-schema";
import { db, must } from "./supabase";

type StoredImage = { postId: string; url: string; caption?: string; dataUrl?: string };

const ANALYST_SYSTEM = `You are the Analyst agent of an agentic dating site. You read ONE person's public LinkedIn and public Instagram and build their dating profile.
Rules:
- Use ONLY the data provided. Never invent facts, employers, places, hobbies or relationships.
- Every insight needs at least one evidence item pointing to the exact source: source "linkedin" with ref like "about", "headline", "experience[2]", "education[0]", "skills", "volunteering"; or source "instagram" with ref = the post id (e.g. "C3xYz12") or "bio". Quotes must be short and real.
- Photo notes come from a vision model looking at their photos; cite them with source "instagram" and ref = post id, except "profile_pic" (source "instagram", ref "profile_pic") and "linkedin_photo" (source "linkedin", ref "photo").
- Some people share little (private or empty Instagram, short LinkedIn). Then return fewer items with lower confidence; an empty list is better than an invented one.
- Inferences (needs, dealbreakers, values) are allowed but must be grounded in evidence; lower the confidence when inferring.
- Gender: set it only from explicit signals (pronouns, self-descriptions like mom/dad/wife/husband/sister, or what photos clearly show) and quote the signal; otherwise "unknown".
- Do NOT infer religion, ethnicity, sexual orientation, health, politics or relationship status.
- Write warmly, specifically and concretely, like a great matchmaker. Avoid generic filler.`;

export async function describePhotos(images: StoredImage[]): Promise<PhotoNotesT> {
  const withData = images.filter((i) => i.dataUrl).slice(0, 6);
  if (!withData.length) return { photos: [] };
  // The vision model accepts at most 3 images per request.
  const chunks: StoredImage[][] = [];
  for (let i = 0; i < withData.length; i += 3) chunks.push(withData.slice(i, i + 3));
  const results = await Promise.all(chunks.map((chunk) =>
    chatJSON({
      model: MODELS.vision,
      system: "You describe Instagram photos for a dating profile analyst. Be concrete: setting, activities, objects, style, mood. Do not guess identity, ethnicity, religion, health or orientation.",
      user: [
        { type: "text", text: `Describe each photo. Post ids in order: ${chunk.map((i) => i.postId).join(", ")}` },
        ...chunk.map((i) => ({ type: "image_url" as const, image_url: { url: i.dataUrl! } })),
      ],
      schema: PhotoNotes,
      maxTokens: 1500,
    }).catch((e) => {
      console.warn("vision chunk failed", (e as Error).message.slice(0, 150));
      return { photos: [] } as PhotoNotesT;
    }),
  ));
  return { photos: results.flatMap((r) => r.photos) };
}

export async function buildProfile(input: {
  linkedin: unknown;
  instagram: unknown;
  images: StoredImage[];
  photoNotes: PhotoNotesT;
}): Promise<ProfileT> {
  const rehosted = Object.fromEntries(input.images.map((i) => [i.postId, i.url]));
  const doc = {
    linkedin: cleanLinkedIn(input.linkedin) ?? "Not available",
    instagram: cleanInstagram(input.instagram, rehosted) ?? "Not available",
    photoNotes: input.photoNotes.photos,
  };
  return chatJSON({
    model: MODELS.smart,
    system: ANALYST_SYSTEM,
    user: `Build the dating profile for this person.\n\n${JSON.stringify(doc)}`,
    schema: Profile,
    maxTokens: 6000,
  });
}

/** Full analysis for a person whose sources are already scraped and stored. */
export async function analyzePerson(personId: string, dataUrls: Record<string, string> = {}) {
  const sources = must(await db().from("sources").select("*").eq("person_id", personId)) as {
    kind: string; raw: unknown; images: StoredImage[] | null; status: string;
  }[];
  const li = sources.find((s) => s.kind === "linkedin" && s.status === "done");
  const ig = sources.find((s) => s.kind === "instagram" && s.status === "done");
  if (!li && !ig) throw new Error("No scraped sources for this person");

  await db().from("people").update({ status: "analyzing" }).eq("id", personId);
  const images = [...(ig?.images ?? []), ...(li?.images ?? [])].map((i) => ({ ...i, dataUrl: dataUrls[i.postId] ?? i.url }));
  let photoNotes: PhotoNotesT = { photos: [] };
  try {
    photoNotes = await describePhotos(images);
  } catch (e) {
    console.warn("vision failed", personId, (e as Error).message);
  }
  const profile = await buildProfile({ linkedin: li?.raw, instagram: ig?.raw, images, photoNotes });
  must(await db().from("profiles").upsert({ person_id: personId, data: profile, photo_notes: photoNotes, model: MODELS.smart }));
  await db().from("people").update({ status: "ready", location: profile.location }).eq("id", personId);
  return profile;
}
