"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { anonymousLabel, ROLE_OPTIONS as ROLES } from "@/lib/roles";

const input =
  "h-12 w-full rounded-xl border border-line-strong bg-card px-3.5 text-base text-ink placeholder:text-subtle/70";
const area =
  "w-full resize-none rounded-xl border border-line-strong bg-card px-3.5 py-3 text-base text-ink placeholder:text-subtle/70";

export function CheckinForm({ slug }: { slug: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<string>("");
  const [whoIAm, setWhoIAm] = useState("");
  const [needs, setNeeds] = useState("");
  const [gives, setGives] = useState("");
  const [showName, setShowName] = useState(true);
  const [busy, setBusy] = useState<"call" | "form" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(interview: boolean) {
    setError(null);
    if (!name.trim()) return setError("Please add your name.");
    if (interview && !phone.trim()) return setError("Add your phone number so your agent can call you.");
    if (!interview && !needs.trim() && !gives.trim()) {
      return setError("Tell us what you need or what you can give, or let your agent call you.");
    }
    setBusy(interview ? "call" : "form");
    try {
      const res = await fetch("/api/checkin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          slug,
          name,
          phone,
          role: role || undefined,
          who_i_am: whoIAm,
          needs,
          gives,
          show_name: showName,
          interview,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Check-in failed. Please try again.");
      router.push(interview ? "/me?calling=1" : "/me");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Check-in failed. Please try again.");
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Your name
        <input className={input} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="Your name" />
      </label>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-sm font-medium">I’m a…</legend>
        <div className="flex flex-wrap gap-2">
          {ROLES.map((r) => {
            const on = role === r;
            return (
              <button
                key={r}
                type="button"
                aria-pressed={on}
                onClick={() => setRole(on ? "" : r)}
                className={`h-11 rounded-full border px-4 text-sm font-semibold ${
                  on ? "border-ink bg-ink text-white" : "border-line-strong bg-card text-ink"
                }`}
              >
                {r}
              </button>
            );
          })}
        </div>
      </fieldset>

      <section className="flex flex-col gap-3.5 rounded-[20px] bg-ink p-5 text-white">
        <div className="flex items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-gold">
            <PhoneIcon />
          </span>
          <div className="flex flex-col">
            <span className="font-display text-lg font-semibold">Let my agent interview me</span>
            <span className="text-sm text-[#C9CCD3]">Your phone rings. 3 questions, about 90 seconds.</span>
          </div>
        </div>
        <label className="flex flex-col gap-1.5 text-sm text-[#C9CCD3]">
          Your phone number
          <input
            className="h-12 rounded-xl bg-white px-3.5 text-base text-ink"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+1 415 555 0123"
          />
        </label>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => submit(true)}
          className="h-13 rounded-2xl bg-gold text-base font-semibold text-ink disabled:opacity-60"
        >
          {busy === "call" ? "Checking you in…" : "Call me now"}
        </button>
      </section>

      <div className="flex items-center gap-3 text-sm text-subtle">
        <span className="h-px flex-1 bg-line-strong" />
        or type it in
        <span className="h-px flex-1 bg-line-strong" />
      </div>

      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit(false);
        }}
      >
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          I am…
          <textarea className={area} rows={2} value={whoIAm} onChange={(e) => setWhoIAm(e.target.value)} placeholder="Founder building a BrainTech wearable" />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          I need…
          <textarea className={area} rows={2} value={needs} onChange={(e) => setNeeds(e.target.value)} placeholder="US investors interested in BrainTech" />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          I can give…
          <textarea className={area} rows={2} value={gives} onChange={(e) => setGives(e.target.value)} placeholder="Intros to the Japan neurotech ecosystem" />
        </label>

        <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-line-strong bg-card p-3.5">
          <input
            type="checkbox"
            checked={showName}
            onChange={(e) => setShowName(e.target.checked)}
            className="mt-0.5 size-5.5 shrink-0 accent-ink"
          />
          <span className="flex flex-col gap-1">
            <span className="text-[15px] font-semibold">Show my name on the big screen</span>
            <span className="text-[13px] leading-snug text-subtle">
              What you give is public. What you receive stays private. Unchecked, you appear as “{anonymousLabel(role || null)}”.
            </span>
          </span>
        </label>

        {error && (
          <p role="alert" className="rounded-xl bg-[#FDECEC] px-3.5 py-3 text-sm text-[#8A1C1C]">
            {error}
          </p>
        )}

        <button type="submit" disabled={busy !== null} className="h-14 rounded-2xl bg-ink text-base font-semibold text-white disabled:opacity-60">
          {busy === "form" ? "Finding your people…" : "Find my matches"}
        </button>
        <p className="text-center text-[13px] text-subtle">Your phone number is never shown to anyone.</p>
      </form>
    </div>
  );
}

function PhoneIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#15171C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z" />
    </svg>
  );
}
