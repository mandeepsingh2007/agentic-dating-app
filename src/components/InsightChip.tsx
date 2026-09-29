"use client";
/* eslint-disable @next/next/no-img-element */
import { useState } from "react";
import type { InsightT } from "@/lib/profile-schema";

export type ImageMap = Record<string, { url: string; caption?: string; postUrl?: string }>;

export function InsightChip({ insight, images, tone = "gold" }: { insight: InsightT; images: ImageMap; tone?: "gold" | "rose" | "sage" }) {
  const [open, setOpen] = useState(false);
  const toneCls = { gold: "border-gold/40 text-gold", rose: "border-rose/40 text-rose", sage: "border-sage/40 text-sage" }[tone];
  return (
    <div className="w-full">
      <button
        onClick={() => setOpen(!open)}
        className={`group flex w-full items-center gap-2 rounded-xl border bg-card/60 px-3 py-2 text-left transition hover:bg-card ${toneCls}`}
      >
        <span className="font-medium">{insight.label}</span>
        <span className="ml-auto flex items-center gap-2 text-[11px] text-muted">
          <SourceIcons insight={insight} />
          {Math.round(insight.confidence * 100)}%
          <span className="text-muted/70 transition group-hover:text-foreground">{open ? "−" : "+"}</span>
        </span>
      </button>
      {open && (
        <div className="rise mt-2 space-y-2 rounded-xl border border-line bg-ink/60 p-3 text-sm">
          <p className="text-foreground/90">{insight.detail}</p>
          <div className="text-[11px] uppercase tracking-wider text-muted">Evidence</div>
          {insight.evidence.map((e, i) => {
            const img = e.source === "instagram" ? images[e.ref] : undefined;
            return (
              <div key={i} className="flex gap-3 rounded-lg bg-card/70 p-2">
                {img ? (
                  <a href={img.postUrl} target="_blank" rel="noreferrer">
                    <img src={img.url} alt="" className="h-16 w-16 rounded-md object-cover" />
                  </a>
                ) : null}
                <div className="min-w-0">
                  <div className="text-[11px] text-muted">
                    <span className={e.source === "linkedin" ? "text-sky-400" : "text-pink-400"}>{e.source === "linkedin" ? "LinkedIn" : "Instagram"}</span>
                    {" · "}
                    {e.ref}
                  </div>
                  <div className="italic text-foreground/85">&ldquo;{e.quote}&rdquo;</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SourceIcons({ insight }: { insight: InsightT }) {
  const kinds = new Set(insight.evidence.map((e) => e.source));
  return (
    <span className="flex gap-1">
      {kinds.has("linkedin") && <span className="rounded bg-sky-500/15 px-1 text-sky-400">in</span>}
      {kinds.has("instagram") && <span className="rounded bg-pink-500/15 px-1 text-pink-400">ig</span>}
    </span>
  );
}
