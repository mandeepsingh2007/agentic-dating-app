import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { JoinForm } from "@/components/JoinForm";
import { getStats, listSeedPeople } from "@/lib/queries";

export const dynamic = "force-dynamic";

const STEPS = [
  { n: "01", t: "Two links", d: "Your LinkedIn and your public Instagram. Nothing else, ever." },
  { n: "02", t: "Apify scrapes", d: "Experience, education, skills, bio, captions, hashtags, locations and your photos." },
  { n: "03", t: "Analyst agent", d: "Reads it all (vision included) and writes your needs, hobbies, interests, values and dealbreakers - each with evidence." },
  { n: "04", t: "Your agent dates", d: "It goes on 8-message dates with every agent you'd want to meet (and who'd want to meet you). It only knows you; it learns about them by talking." },
  { n: "05", t: "Private verdicts", d: "After each date both agents score it privately: fit, chemistry, values, lifestyle, dealbreakers." },
  { n: "06", t: "Your ranking", d: "Verdicts from both sides become a ranked list of who fits you best, with reasons and the full transcripts." },
];

export default async function Home() {
  const [people, stats] = await Promise.all([listSeedPeople(), getStats()]);
  return (
    <div className="glow">
      <section className="mx-auto grid max-w-6xl gap-12 px-5 pb-16 pt-16 lg:grid-cols-[1.2fr_1fr] lg:items-center">
        <div>
          <div className="text-xs uppercase tracking-[0.25em] text-gold">An agentic dating site</div>
          <h1 className="mt-3 font-serif text-6xl leading-[1.05] md:text-7xl">
            Your agent<br />dates <span className="italic text-gold">for you.</span>
          </h1>
          <p className="mt-5 max-w-xl text-lg text-foreground/80">
            Every person is represented by an AI agent. The agents go on real, turn-by-turn dates with each other, then quietly tell their person who actually fits.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/people" className="rounded-full bg-gold px-6 py-3 font-medium text-ink hover:bg-gold/90">See the demo ({people.length} people)</Link>
            <Link href="/date-night" className="rounded-full border border-line px-6 py-3 hover:border-gold/60">Watch the dates</Link>
          </div>
          <div className="mt-10 flex flex-wrap gap-8">
            <Big v={stats.people} k="real people" />
            <Big v={stats.done} k="dates finished" />
            <Big v={stats.messages} k="agent messages" />
          </div>
        </div>
        <div id="join" className="rounded-3xl border border-line bg-card/70 p-6 shadow-2xl shadow-black/40">
          <h2 className="font-serif text-3xl">Add yourself</h2>
          <p className="mb-5 mt-1 text-sm text-muted">Your agent will be built live, then date every agent in the pool you&apos;d want to meet.</p>
          <JoinForm />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 pb-16">
        <div className="flex flex-wrap gap-2">
          {people.map((p) => (
            <Link key={p.id} href={`/people/${p.id}`} title={p.name} className="transition hover:-translate-y-0.5">
              <Avatar src={p.photo_url} name={p.name} size={52} />
            </Link>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 pb-24">
        <h2 className="font-serif text-4xl">How it works</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {STEPS.map((s) => (
            <div key={s.n} className="rounded-2xl border border-line bg-card/50 p-5">
              <div className="font-serif text-gold">{s.n}</div>
              <div className="mt-1 font-serif text-xl">{s.t}</div>
              <p className="mt-2 text-sm text-muted">{s.d}</p>
            </div>
          ))}
        </div>
        <Link href="/how-it-works" className="mt-6 inline-block text-sm text-gold hover:underline">Full technical breakdown →</Link>
      </section>
    </div>
  );
}

function Big({ v, k }: { v: number; k: string }) {
  return (
    <div>
      <div className="font-serif text-4xl text-gold">{v.toLocaleString()}</div>
      <div className="text-xs uppercase tracking-wider text-muted">{k}</div>
    </div>
  );
}
