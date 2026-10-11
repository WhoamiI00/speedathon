import "server-only";
import QRCode from "qrcode";
import { headers } from "next/headers";

// Owner: T5. Small server helpers shared by the pages.

/** Absolute origin of the current request (for QR codes that phones open). */
export async function origin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/** Inline SVG markup for a QR code pointing at `url`. */
export function qrSvg(url: string): Promise<string> {
  return QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
}

type Labelled = { name: string; role: string | null; show_name: boolean };

/** Public label: the name only if they opted in, otherwise "A founder" (PLAN §2c). */
export function publicLabel(p: Labelled): string {
  return p.show_name ? p.name : `A ${(p.role ?? "participant").toLowerCase()}`;
}

/** Inside an intro both people agreed to, first names are fine; before that, use the public label. */
export function introLabel(p: Labelled, mutual: boolean): string {
  return mutual ? p.name.trim().split(/\s+/)[0] || p.name : publicLabel(p);
}

export const short = (s: string | null | undefined, n: number) => {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};
