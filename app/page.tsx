"use client";

import { useRouter } from "next/navigation";
import { Welcome } from "@/components/Welcome";
import { useGameStore } from "@/lib/store";

export default function HomePage() {
  const router = useRouter();
  const initSession = useGameStore((s) => s.initSession);

  const start = (initCapital: number) => {
    initSession({
      ticker: "AAPL",
      startDate: "2026-03-30",
      totalDays: 32,
      initialCapital: initCapital,
    });
    router.push("/play");
  };

  return <Welcome onStart={start} />;
}
