const PIPE = [
  ["Paste links", "LinkedIn URL + public Instagram URL"],
  ["Apify", "harvestapi/linkedin-profile-scraper + apify/instagram-profile-scraper, async runs polled by the browser"],
  ["Storage", "Raw JSON saved in Postgres; Instagram photos rehosted to Supabase Storage (IG links expire)"],
  ["Analyst agent", "Vision model describes 6 photos, then a reasoning model writes the evidence-backed profile"],
  ["Dating agents", "One per person. 8 turns, each its own LLM call, each agent sees only its own person + the chat"],
  ["Verdicts", "Each agent privately scores fit, chemistry, values, lifestyle, dealbreakers, second date"],
  ["Ranking", "0.7 × my verdict + 0.3 × their verdict − dealbreaker + mutual bonus"],
];

export default function HowItWorks() {
  return (
    <div className="glow">
      <div className="mx-auto max-w-4xl px-5 py-12">
        <div className="text-xs uppercase tracking-[0.2em] text-gold">Under the hood</div>
        <h1 className="mt-1 font-serif text-5xl">How Date by Proxy works</h1>

        <div className="mt-10 space-y-2">
          {PIPE.map(([t, d], i) => (
            <div key={t}>
              <div className="flex items-start gap-4 rounded-2xl border border-line bg-card/50 p-4">
                <span className="font-serif text-gold">{String(i + 1).padStart(2, "0")}</span>
                <div><div className="font-serif text-xl">{t}</div><div className="text-sm text-muted">{d}</div></div>
              </div>
              {i < PIPE.length - 1 && <div className="ml-7 h-3 w-px bg-line" />}
            </div>
          ))}
        </div>

        <Section title="The two sources, and nothing else">
          Every fact about a person comes from their public LinkedIn (headline, about, experience, education, skills, languages, volunteering) or their public Instagram
          (bio, captions, hashtags, locations, alt text and the photos themselves). Scraping runs on Apify; raw output is stored so every insight is auditable.
        </Section>
        <Section title="Evidence, not vibes">
          Every hobby, interest, value, need and dealbreaker on a profile page carries evidence (the LinkedIn field or the Instagram post it came from, with a quote)
          and a confidence score. The Analyst is told never to invent facts and never to infer sensitive traits like religion, ethnicity, orientation, health or politics.
        </Section>
        <Section title="Agents that really only know their own person">
          A date is not one big prompt. Agent A gets A&apos;s profile and the transcript so far; agent B gets B&apos;s. They alternate for 8 messages across four phases:
          icebreaker, lifestyle, values &amp; goals, dealbreakers. Each side runs on a different model instance. After the date each agent writes a private verdict
          citing moments from the conversation against its person&apos;s needs.
        </Section>
        <Section title="Who dates whom">
          A date only happens if each person is someone the other wants to meet. Visitors choose who they want to date (women, men or everyone).
          For the seed pool we default to opposite-gender matching, using a gender the Analyst reads only from explicit signals in the person&apos;s own
          profiles (pronouns, self-descriptions like &ldquo;Mom&rdquo; or &ldquo;Dad&rdquo;, or their own profile photo) and cites as evidence. Orientation is never inferred.
        </Section>
        <Section title="Ranking">
          viewScore = 0.4 fit + 0.2 chemistry + 0.25 values + 0.15 lifestyle. score(A,B) = 0.7 × A&apos;s view of B + 0.3 × B&apos;s view of A − 3 if a dealbreaker was hit + 0.5 if both want a
          second date. Seed people are ranked against the seed pool; visitors date and are ranked against every matching seed agent.
        </Section>
        <Section title="Stack">
          Next.js 16 + TypeScript + Tailwind on Vercel · Supabase Postgres + Storage · Apify (apify-client) · Groq (OpenAI-compatible API): gpt-oss-120b for analysis and verdicts,
          gpt-oss-20b and Qwen 3 for date turns, Qwen 3 vision for Instagram photos · zod-validated JSON output. The browser orchestrates the pipeline in short API calls so
          nothing hits a serverless timeout.
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="font-serif text-2xl">{title}</h2>
      <p className="mt-2 leading-relaxed text-foreground/80">{children}</p>
    </section>
  );
}
