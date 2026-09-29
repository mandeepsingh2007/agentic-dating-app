import { NextResponse } from "next/server";
import { computeRanking } from "@/lib/ranking";

export async function POST(_req: Request, ctx: RouteContext<"/api/people/[id]/rank">) {
  const { id } = await ctx.params;
  const ranking = await computeRanking(id);
  return NextResponse.json({ count: ranking.length });
}
