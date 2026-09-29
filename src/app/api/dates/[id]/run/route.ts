import { NextResponse } from "next/server";
import { runDate } from "@/lib/dating";

export const maxDuration = 300;

export async function POST(_req: Request, ctx: RouteContext<"/api/dates/[id]/run">) {
  const { id } = await ctx.params;
  try {
    await runDate(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
