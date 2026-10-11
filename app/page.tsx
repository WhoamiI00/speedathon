import Link from "next/link";
import { primaryBtn, secondaryBtn } from "@/app/ui";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="text-4xl font-semibold tracking-tight">Giverank</h1>
      <p className="max-w-md text-zinc-600 dark:text-zinc-400">The AI networking agent that makes giving visible.</p>
      <div className="flex flex-wrap justify-center gap-3">
        <Link className={primaryBtn} href="/r/speedhacks">
          Check in to SpeedHacks
        </Link>
        <Link className={secondaryBtn} href="/me">
          My page
        </Link>
        <Link className={secondaryBtn} href="/dashboard">
          Big screen
        </Link>
      </div>
    </main>
  );
}
