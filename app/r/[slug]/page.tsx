import { notFound } from "next/navigation";
import { CheckinForm } from "@/components/CheckinForm";
import { Logo } from "@/components/Logo";
import { db } from "@/lib/supabase/server";

// Event QR target (PLAN §4): check-in form + "Let my agent interview me" + show-name opt-in.
export default async function CheckinPage(props: PageProps<"/r/[slug]">) {
  const { slug } = await props.params;
  const { data: room } = await db().from("rooms").select("name").eq("slug", slug).maybeSingle();
  if (!room) notFound();

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-6 px-5 pt-5 pb-10">
      <header className="flex items-center justify-between">
        <Logo />
        <span className="flex items-center gap-1.5 rounded-full bg-ink px-2.5 py-1.5 text-[13px] font-medium text-white">
          <span className="size-1.5 rounded-full bg-gold" />
          {room.name} · Live
        </span>
      </header>

      <div className="flex flex-col gap-2.5 pt-2">
        <h1 className="font-display text-[34px] leading-[1.08] font-bold tracking-tight">Meet the people you should meet tonight.</h1>
        <p className="text-base leading-normal text-muted">
          Tell your agent who you are, what you need and what you can give. It finds people in this room where the help goes both ways.
        </p>
      </div>

      <CheckinForm slug={slug} />
    </main>
  );
}
