import { NextResponse } from "next/server";
import { getDate } from "@/lib/queries";

export async function GET(_req: Request, ctx: RouteContext<"/api/dates/[id]">) {
  const { id } = await ctx.params;
  const data = await getDate(id);
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(data);
}
