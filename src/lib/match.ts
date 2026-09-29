import type { ProfileT, Seeking } from "./profile-schema";

type G = "woman" | "man" | "unknown";

/** Who a person wants to meet: their stated preference, else opposite gender, else everyone. */
export function seekingOf(p: Pick<ProfileT, "gender" | "seeking">): Seeking {
  if (p.seeking) return p.seeking;
  if (p.gender?.gender === "woman") return "men";
  if (p.gender?.gender === "man") return "women";
  return "everyone";
}

function accepts(seeking: Seeking, g: G) {
  if (seeking === "everyone" || g === "unknown") return true;
  return seeking === "women" ? g === "woman" : g === "man";
}

/** A date only makes sense if each side is someone the other wants to meet. */
export function isMatchable(a: Pick<ProfileT, "gender" | "seeking">, b: Pick<ProfileT, "gender" | "seeking">) {
  const ga = (a.gender?.gender ?? "unknown") as G;
  const gb = (b.gender?.gender ?? "unknown") as G;
  return accepts(seekingOf(a), gb) && accepts(seekingOf(b), ga);
}
