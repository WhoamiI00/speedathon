import { connection } from "next/server";
import { db } from "@/lib/supabase/server";

// GET /api/health → is the deploy alive and connected to the DB?
export async function GET() {
  await connection();
  const env = Object.fromEntries(
    [
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
      "GEMINI_API_KEY",
      "ANTHROPIC_API_KEY",
      "DIAL_API_KEY",
      "DIAL_NUMBER",
      "KEEWANO_API_KEY",
      "KEEWANO_PAT",
      "DARWIN_API_KEY",
      "COOKIE_SECRET",
    ].map((k) => [k, Boolean(process.env[k])]),
  );
  try {
    const { count, error } = await db().from("people").select("id", { count: "exact", head: true });
    if (error) throw new Error(error.message);
    return Response.json({ ok: true, people: count, env });
  } catch (e) {
    return Response.json({ ok: false, error: String(e), env }, { status: 500 });
  }
}
