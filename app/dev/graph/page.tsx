import { notFound } from "next/navigation";
import { GraphPreview } from "./GraphPreview";

// Local-only preview of the room circle with made-up crowds (never touches the database).
// Returns 404 in production builds.
export default function GraphPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <GraphPreview />;
}
