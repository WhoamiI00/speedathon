"use client";

import { useState } from "react";
import { ResponsiveGraph } from "@/components/ResponsiveGraph";
import type { GraphLink } from "@/components/RoomGraph";

export function DashboardGraph(props: { center: { initials: string; name: string; tag: string }; links: GraphLink[]; outer: number[] }) {
  const [sel, setSel] = useState(-1);
  return <ResponsiveGraph max={620} {...props} selected={sel} onSelect={setSel} />;
}
