"use client";

import { useRouter } from "next/navigation";
import { Welcome } from "@/components/Welcome";
import { useGameStore } from "@/lib/store";
import type { Scenario } from "@/lib/scenarios";

export default function HomePage() {
  const router = useRouter();
  const initSession = useGameStore((s) => s.initSession);

  const start = (initCapital: number, scenario: Scenario) => {
    initSession({
      ticker: scenario.ticker,
      startDate: scenario.startDate,
      totalDays: 32,
      initialCapital: initCapital,
    });
    router.push("/play");
  };

  return <Welcome onStart={start} />;
}
