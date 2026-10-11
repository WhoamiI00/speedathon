import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/supabase/server";
import { isUuid } from "@/lib/ledger";
import type { PublicGiver } from "@/lib/types";
import { card, muted } from "@/app/ui";

// Public giving profile (PLAN §4). Reads only the public_givers view: never the balance or the take side.
export default async function PublicProfile({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { data } = await db().from("public_givers").select("*").eq("id", id).maybeSingle<PublicGiver>();
  if (!data) notFound();

  const stats = [
    ["Give score", Number(data.give_score).toFixed(2)],
    ["Verified helpful intros", String(data.verified_intros)],
    ["Helpfulness", data.helpfulness == null ? "–" : `${Number(data.helpfulness).toFixed(1)} / 3`],
  ];
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-10">
      <header>
        <p className="text-sm text-zinc-500">Giverank profile</p>
        <h1 className="text-3xl font-semibold tracking-tight">{data.display_name}</h1>
        {data.role && <p className={muted}>{data.role}</p>}
      </header>
      <section className="grid grid-cols-3 gap-2">
        {stats.map(([label, value]) => (
          <div key={label} className={`${card} text-center`}>
            <p className="text-2xl font-semibold">{value}</p>
            <p className="text-xs text-zinc-500">{label}</p>
          </div>
        ))}
      </section>
      <p className={`text-sm ${muted}`}>Giving is public. Taking stays private: nobody&apos;s balance is shown here.</p>
      <Link className="text-sm underline" href="/dashboard">
        Top connectors →
      </Link>
    </main>
  );
}
