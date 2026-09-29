import { z } from "zod";

export const Evidence = z.object({
  source: z.enum(["linkedin", "instagram"]),
  ref: z.string().describe('LinkedIn field (e.g. "about", "experience[0]", "headline") or Instagram post id / "bio"'),
  quote: z.string().describe("Short exact quote or concrete fact from that source"),
});

export const Insight = z.object({
  label: z.string().describe("2-4 word tag"),
  detail: z.string().describe("One sentence explaining it"),
  confidence: z.number().min(0).max(1),
  evidence: z.array(Evidence).min(1),
});

export const PhotoNote = z.object({
  postId: z.string(),
  scene: z.string(),
  activities: z.array(z.string()),
  vibe: z.string(),
});
export const PhotoNotes = z.object({ photos: z.array(PhotoNote) });

export const Gender = z.object({
  gender: z.enum(["woman", "man", "unknown"]),
  evidence: z.string().describe("The explicit signal used: pronouns, self-description (mom, dad, wife, husband, sister...), or what the photos clearly show. Empty if unknown."),
});
export type GenderT = z.infer<typeof Gender>;
export type Seeking = "women" | "men" | "everyone";

export const Profile = z.object({
  gender: Gender,
  oneLiner: z.string().describe("Punchy dating-profile one-liner grounded in the data"),
  summary: z.string().describe("3-4 sentence summary of who they are"),
  location: z.string(),
  career: z.object({
    current: z.string(),
    trajectory: z.string(),
    ambition: z.number().min(1).max(5),
    workStyle: z.string(),
  }),
  education: z.array(z.string()),
  hobbies: z.array(Insight).describe("3-6 hobbies"),
  interests: z.array(Insight).describe("3-6 interests / topics they care about"),
  values: z.array(Insight).describe("3-5 core values"),
  lifestyle: z.array(Insight).describe("2-5 lifestyle traits: travel, fitness, social life, pace, food, family"),
  personality: z.array(z.object({
    trait: z.enum(["Openness", "Conscientiousness", "Extraversion", "Agreeableness", "Emotional stability"]),
    score: z.number().min(1).max(5),
    why: z.string(),
  })),
  communicationStyle: z.string(),
  needs: z.array(Insight).describe("3-5 things they likely need in a partner"),
  dealbreakers: z.array(Insight).describe("1-3 likely dealbreakers (lower confidence is fine)"),
  greenFlags: z.array(z.string()),
  conversationStarters: z.array(z.string()),
  idealDate: z.string(),
  photoHighlights: z.array(z.object({ postId: z.string(), whatItShows: z.string() })),
});

export type ProfileT = z.infer<typeof Profile> & { seeking?: Seeking };
export type InsightT = z.infer<typeof Insight>;
export type PhotoNotesT = z.infer<typeof PhotoNotes>;
