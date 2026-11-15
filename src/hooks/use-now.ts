"use client";
import { useEffect, useState } from "react";
/** Refresh time outside render so deadlines stay current and hydration is stable. */
export function useNow() {
  const [now, setNow] = useState(0);
  useEffect(() => {
    const refresh = () => setNow(Date.now());
    refresh();
    const timer = setInterval(refresh, 60000);
    return () => clearInterval(timer);
  }, []);
  return now;
}
