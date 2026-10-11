import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/supabase/server";
import { getPersonId } from "@/lib/session";
import { publicLabel } from "@/lib/ui";
import { muted, primaryBtn } from "@/app/ui";
import RecordMeet from "./record-meet";

// What a phone's native camera opens when it scans someone's personal QR (PLAN §4).
// The scan is recorded by a client POST, not on GET, so link previews and prefetches never count as a meeting.
export default async function MeetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { data: them } = await db().from("people").select("id,name,role,show_name").eq("qr_token", token).maybeSingle();
  if (!them) notFound();
  const pid = await getPersonId();

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-4 px-4 py-10 text-center">
      <p className="text-sm text-zinc-500">You scanned</p>
      <h1 className="text-3xl font-semibold tracking-tight">{publicLabel(them)}</h1>
      {!pid ? (
        <>
          <p className={muted}>Check in first, then scan their code again to record that you met.</p>
          <Link className={`${primaryBtn} py-3`} href="/r/speedhacks">
            Check in
          </Link>
        </>
      ) : pid === them.id ? (
        <p className={muted}>That&apos;s your own code. Let the other person scan it.</p>
      ) : (
        <RecordMeet token={token} />
      )}
    </main>
  );
}
