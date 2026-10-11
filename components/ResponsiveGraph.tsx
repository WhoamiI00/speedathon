"use client";

import { useEffect, useRef, useState } from "react";
import { RoomGraph } from "@/components/RoomGraph";

type GraphProps = Omit<Parameters<typeof RoomGraph>[0], "size">;

// RoomGraph sized to its container (capped at max), so it never overflows a narrow phone.
export function ResponsiveGraph({ max, ...props }: GraphProps & { max: number }) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(Math.min(max, 320));

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setSize(Math.max(240, Math.min(max, Math.floor(entry.contentRect.width)))));
    ro.observe(el);
    return () => ro.disconnect();
  }, [max]);

  return (
    <div ref={box} className="flex w-full justify-center">
      <RoomGraph size={size} {...props} />
    </div>
  );
}
