import type { Metadata } from "next";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Evidence } from "@/lib/types";
import { RecordedDemonstrator } from "@/components/RecordedDemonstrator";
import "./demonstrator.css";

export const metadata: Metadata = {
  title: "ISR mission | Quantum Dice",
  description: "A guided mission replay showing aircraft routes, measured results and the mission bottleneck.",
};

export default async function DemonstratorPage() {
  const evidence: Evidence = JSON.parse(await readFile(join(process.cwd(), "public/recorded/mission-evidence.json"), "utf8"));
  const instance = evidence.scales.large.instances.find(item => item.seed === 42);
  if (!instance) throw new Error("The recorded large seed 42 mission is missing.");
  return <RecordedDemonstrator instance={instance} comparisons={evidence.scales.large.instances.map(item => ({ seed: item.seed, benchmarks: item.benchmarks, fallback: Boolean(item.plan.metadata.greedy_fallback_used) }))} />;
}
