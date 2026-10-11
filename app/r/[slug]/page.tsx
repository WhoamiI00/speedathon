import { notFound } from "next/navigation";
import { db } from "@/lib/supabase/server";
import { muted } from "@/app/ui";
import CheckinForm from "./checkin-form";

// Event QR target (PLAN §4). Minimal version; T5 owns the real design.
export default async function RoomCheckin({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { data: room } = await db().from("rooms").select("slug,name").eq("slug", slug).maybeSingle();
  if (!room) notFound();

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-10">
      <header className="flex flex-col gap-1">
        <p className="text-sm text-zinc-500">{room.name}</p>
        <h1 className="text-3xl font-semibold tracking-tight">Check in to Giverank</h1>
        <p className={muted}>Tell us what you need and what you can give. Your agent finds the people here you should meet.</p>
      </header>
      <CheckinForm slug={room.slug} />
    </main>
  );
}
