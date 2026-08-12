"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Server components only re-render on navigation, so work recorded at another station stays
 * invisible until the operator reloads. This re-fetches the server render on an interval —
 * client state (typed input, open dropdowns) survives, only the server data is replaced.
 */
export default function AutoRefresh({ seconds = 30 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);
  return null;
}
