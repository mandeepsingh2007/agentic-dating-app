// Sets the evidence-based gender field on every profile. Signals, in priority order:
// 1) pronouns / self-descriptions in their own LinkedIn or Instagram text, 2) their own profile photo.
// Post photos are ignored because they often show other people.
import pLimit from "p-limit";
import { z } from "zod";
import { chatJSON, MODELS } from "../src/lib/llm";
import { Gender, type ProfileT } from "../src/lib/profile-schema";
import { cleanInstagram, cleanLinkedIn } from "../src/lib/sources";
import { db, must } from "../src/lib/supabase";

const Avatar = z.object({ description: z.string() });

async function main() {
  const profiles = must(await db().from("profiles").select("person_id,data")) as { person_id: string; data: ProfileT }[];
  const limit = pLimit(4);
  await Promise.all(profiles.map((p) => limit(async () => {
    const { data: person } = await db().from("people").select("name,photo_url").eq("id", p.person_id).single();
    const sources = must(await db().from("sources").select("kind,raw").eq("person_id", p.person_id)) as { kind: string; raw: unknown }[];
    const li = cleanLinkedIn(sources.find((s) => s.kind === "linkedin")?.raw);
    const ig = cleanInstagram(sources.find((s) => s.kind === "instagram")?.raw);
    let avatar = "";
    if (person?.photo_url) {
      avatar = (await chatJSON({
        model: MODELS.vision,
        system: "Describe the main person in this profile photo in one sentence (apparent gender presentation, hair, clothing, setting). If several people or none, say so.",
        user: [{ type: "text", text: "Profile photo:" }, { type: "image_url", image_url: { url: person.photo_url } }],
        schema: Avatar,
        maxTokens: 300,
      }).catch(() => ({ description: "" }))).description;
    }
    const doc = {
      linkedinAbout: li?.about, linkedinHeadline: li?.headline, instagramBio: ig?.bio,
      captions: ig?.posts.slice(0, 12).map((x) => x.caption).filter(Boolean),
      ownProfilePhoto: avatar,
    };
    const g = await chatJSON({
      model: MODELS.smart,
      system: `Determine the gender of the profile owner from their own public LinkedIn + Instagram.
Allowed signals, in priority order: (1) pronouns or self-descriptions about the OWNER in their own text (e.g. "she is", "he founded", "Mom", "Dad", "mother", "father", "#girlboss"); (2) the owner's own profile photo description.
Captions mentioning other people ("my wife", "my daughter") are not about the owner. Names alone are not evidence.
Quote the signal you used. Answer unknown only if there is truly no signal.`,
      user: JSON.stringify(doc),
      schema: Gender,
      maxTokens: 800,
    });
    must(await db().from("profiles").update({ data: { ...p.data, gender: g } }).eq("person_id", p.person_id));
    console.log(`${person?.name}: ${g.gender} (${g.evidence.slice(0, 90)})`);
  })));
}

main().catch((e) => { console.error(e); process.exit(1); });
