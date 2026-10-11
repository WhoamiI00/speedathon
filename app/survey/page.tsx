import { Logo } from "@/components/Logo";
import { SurveyForm } from "@/components/SurveyForm";

export const metadata = { title: "Quick question · Sevendipity" };

// Baseline survey (PLAN §10): answered before check-in so we can compare against tonight's real numbers.
export default function SurveyPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-6 px-5 pt-5 pb-10">
      <header>
        <Logo />
      </header>
      <div className="flex flex-col gap-2.5 pt-2">
        <h1 className="font-display text-[30px] leading-[1.1] font-bold tracking-tight">At events like this, how long until you meet someone actually useful?</h1>
        <p className="text-base leading-normal text-muted">One tap. It gives us a baseline to measure tonight against.</p>
      </div>
      <SurveyForm />
    </main>
  );
}
