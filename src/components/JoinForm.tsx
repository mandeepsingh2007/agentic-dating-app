"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function JoinForm() {
  const router = useRouter();
  const [linkedin, setLinkedin] = useState("");
  const [instagram, setInstagram] = useState("");
  const [seeking, setSeeking] = useState("");
  const [gender, setGender] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!gender) return setError("Tell us who you are.");
    if (!seeking) return setError("Pick who you want to date.");
    setLoading(true);
    const res = await fetch("/api/join", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ linkedin, instagram }) });
    const j = await res.json();
    if (!res.ok) {
      setError(j.error ?? "Something went wrong");
      setLoading(false);
      return;
    }
    router.push(`/join/${j.personId}?seeking=${seeking}&gender=${gender}`);
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <label className="block">
        <span className="text-xs uppercase tracking-wider text-sky-400">LinkedIn</span>
        <input required value={linkedin} onChange={(e) => setLinkedin(e.target.value)} placeholder="https://www.linkedin.com/in/your-name"
          className="mt-1 w-full rounded-xl border border-line bg-ink px-4 py-3 outline-none focus:border-gold/70" />
      </label>
      <label className="block">
        <span className="text-xs uppercase tracking-wider text-pink-400">Public Instagram</span>
        <input required value={instagram} onChange={(e) => setInstagram(e.target.value)} placeholder="https://www.instagram.com/yourname"
          className="mt-1 w-full rounded-xl border border-line bg-ink px-4 py-3 outline-none focus:border-gold/70" />
      </label>
      <Choice label="I am" value={gender} onChange={setGender} options={[["woman", "A woman"], ["man", "A man"], ["unknown", "Other"]]} />
      <Choice label="I want to date" value={seeking} onChange={setSeeking} options={[["women", "Women"], ["men", "Men"], ["everyone", "Everyone"]]} />
      {error && <p className="text-sm text-rose">{error}</p>}
      <button disabled={loading} className="w-full rounded-xl bg-gold py-3 font-medium text-ink transition hover:bg-gold/90 disabled:opacity-60">
        {loading ? "Starting your agent…" : "Create my agent & start dating"}
      </button>
      <p className="text-xs text-muted">We scrape only these two public profiles (via Apify). Takes about 2-3 minutes end to end.</p>
    </form>
  );
}

function Choice({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[][] }) {
  return (
    <div>
      <span className="text-xs uppercase tracking-wider text-gold">{label}</span>
      <div className="mt-1 grid grid-cols-3 gap-2">
        {options.map(([v, text]) => (
          <button type="button" key={v} onClick={() => onChange(v)}
            className={`rounded-xl border py-2.5 text-sm transition ${value === v ? "border-gold bg-gold/15 text-gold" : "border-line bg-ink hover:border-gold/50"}`}>
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}
