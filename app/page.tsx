import Link from "next/link";
import { LogoMark } from "@/components/Logo";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8 text-center">
      <LogoMark size={72} />
      <h1 className="font-display text-4xl font-bold tracking-tight">Sevendipity</h1>
      <p className="max-w-md text-muted">
        More chances for serendipity. Your agent finds the people you should meet, and makes giving visible.
      </p>
      <Link className="rounded-full bg-ink px-5 py-3 font-semibold text-white" href="/r/speedhacks">
        Check in to SpeedHacks
      </Link>
    </main>
  );
}
