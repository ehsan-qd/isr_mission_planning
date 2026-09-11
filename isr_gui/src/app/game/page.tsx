import type { Metadata } from "next";
import { MissionGame } from "@/components/MissionGame";
import "./game.css";

export const metadata: Metadata = { title: "Loss of Signal · ORBIT", description: "Four aircraft, a burning valley, and orders that must survive the silence." };
export default function GamePage() { return <MissionGame />; }
