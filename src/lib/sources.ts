// Turns raw Apify output into compact, LLM-friendly source documents.
/* eslint-disable @typescript-eslint/no-explicit-any */

const cut = (s: unknown, n: number) => (typeof s === "string" ? (s.length > n ? s.slice(0, n) + "…" : s) : undefined);

export type IgPost = {
  id: string;
  url: string;
  type?: string;
  caption?: string;
  hashtags?: string[];
  location?: string;
  timestamp?: string;
  likes?: number;
  alt?: string;
  imageUrl?: string;
};

export function cleanLinkedIn(raw: any) {
  if (!raw) return null;
  return {
    name: [raw.firstName, raw.lastName].filter(Boolean).join(" "),
    headline: raw.headline,
    about: cut(raw.about, 2000),
    location: raw.location?.linkedinText ?? raw.location?.parsed?.text,
    topSkills: raw.topSkills,
    currentCompany: raw.currentPosition?.map((p: any) => p.companyName).filter(Boolean),
    experience: (raw.experience ?? []).slice(0, 8).map((e: any) => ({
      title: e.position,
      company: e.companyName,
      duration: e.duration,
      period: [e.startDate?.text, e.endDate?.text].filter(Boolean).join(" - "),
      location: e.location,
      description: cut(e.description, 350),
    })),
    education: (raw.education ?? []).slice(0, 5).map((e: any) => ({
      school: e.schoolName,
      degree: e.degree,
      field: e.fieldOfStudy,
      period: [e.startDate?.text, e.endDate?.text].filter(Boolean).join(" - "),
    })),
    skills: (raw.skills ?? []).slice(0, 25).map((s: any) => s.name ?? s),
    languages: (raw.languages ?? []).map((l: any) => l.name ?? l),
    volunteering: (raw.volunteering ?? []).slice(0, 5).map((v: any) => ({ role: v.role, org: v.organizationName, cause: v.cause })),
    certifications: (raw.certifications ?? []).slice(0, 5).map((c: any) => c.title ?? c.name),
    honors: (raw.honorsAndAwards ?? []).slice(0, 5).map((h: any) => h.title),
    publications: (raw.publications ?? []).slice(0, 5).map((p: any) => p.title),
    followers: raw.followerCount,
  };
}

export function igPosts(raw: any): IgPost[] {
  return (raw?.latestPosts ?? []).map((p: any) => ({
    id: p.shortCode ?? String(p.id),
    url: p.url ?? `https://www.instagram.com/p/${p.shortCode}/`,
    type: p.type,
    caption: cut(p.caption, 500),
    hashtags: p.hashtags?.slice(0, 10),
    location: p.locationName,
    timestamp: p.timestamp,
    likes: p.likesCount,
    alt: p.alt,
    imageUrl: p.displayUrl ?? p.images?.[0],
  }));
}

export function cleanInstagram(raw: any, rehosted: Record<string, string> = {}) {
  if (!raw) return null;
  return {
    username: raw.username,
    fullName: raw.fullName,
    bio: raw.biography,
    externalUrl: raw.externalUrl,
    category: raw.businessCategoryName,
    verified: raw.verified,
    followers: raw.followersCount,
    following: raw.followsCount,
    postsCount: raw.postsCount,
    posts: igPosts(raw).map(({ imageUrl, ...p }) => ({ ...p, hasImage: !!(rehosted[p.id] ?? imageUrl) })),
  };
}
