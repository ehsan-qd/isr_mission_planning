import type { Metadata } from "next";
import { DefencePresentation } from "@/components/DefencePresentation";

export const metadata: Metadata = {
  title: "Defence Briefing | ORBIT ISR Mission Planning",
  description: "How the multi-UAV ISR optimisation was formulated, tested, and prepared for operational development.",
};

export default function PresentationPage() {
  return <DefencePresentation />;
}
