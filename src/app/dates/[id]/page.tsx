import { notFound } from "next/navigation";
import { DateView } from "@/components/DateView";
import { getDate } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function DatePage(props: PageProps<"/dates/[id]">) {
  const { id } = await props.params;
  const data = await getDate(id);
  if (!data) notFound();
  return <div className="glow"><DateView initial={data} /></div>;
}
