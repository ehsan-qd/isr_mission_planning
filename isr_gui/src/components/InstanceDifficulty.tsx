import type { MissionInstance } from "@/lib/types";

function formatCombinations(count: bigint) {
  const digits = count.toString();
  if (digits.length <= 6) return count.toLocaleString("en-GB");
  // Read only the leading digits so even enormous spaces never overflow Number.
  const rounded = Math.round(Number(digits.slice(0, 3)) / 10) / 10;
  const exponent = digits.length - 1 + (rounded === 10 ? 1 : 0);
  const coefficient = rounded === 10 ? 1 : rounded;
  return <>≈ {coefficient.toFixed(1)} × 10<sup>{exponent}</sup></>;
}

export function InstanceDifficulty({ instance }: { instance: MissionInstance }) {
  const eligibleChoices = instance.scenario.tasks.map((task) =>
    instance.scenario.uavs.filter((uav) => uav.sensors.includes(task.required_sensor)).length);
  const variables = eligibleChoices.reduce((total, choices) => total + choices, 0);
  const combinations = eligibleChoices.reduce((total, choices) => total * BigInt(choices), BigInt(1));
  // Display bands describe model size, not measured optimisation hardness.
  const level = variables < 100 ? 1 : variables < 1000 ? 2 : 3;
  const label = ["Low", "Moderate", "High"][level - 1];

  return <section className="instance-difficulty panel" aria-label="Instance solve difficulty">
    <div className="instance-difficulty-summary" aria-live="polite" aria-atomic="true">
      <div className="instance-difficulty-rating" data-level={level}>
        <span className="instance-difficulty-label">Estimated solve difficulty</span>
        <div className="instance-difficulty-level"><strong>{label}</strong><span className="instance-difficulty-meter" aria-hidden="true">{[1, 2, 3].map((step) => <i key={step} className={step <= level ? "filled" : ""}/>)}</span></div>
        <small>Based on assignment-model size</small>
      </div>
      <div>
        <span className="instance-difficulty-label">Assignment variables</span>
        <strong>{variables.toLocaleString("en-GB")}</strong>
        <small>Sensor-compatible UAV–MTE pairs</small>
      </div>
      <div>
        <span className="instance-difficulty-label">Assignment search space</span>
        <strong>{formatCombinations(combinations)}</strong>
        <small>Possible sensor-compatible combinations</small>
      </div>
    </div>
    <details className="instance-difficulty-explanation">
      <summary>How to read difficulty</summary>
      <p>The search space multiplies the number of eligible UAVs for every MTE: k₁ × k₂ × … × kₙ. It counts all sensor-compatible assignments with exactly one UAV per MTE, before choosing route order and timing or checking other mission constraints. Large counts are shown approximately in scientific notation.</p>
      <p>Difficulty is a size-based guide: low below 100 assignment variables, moderate from 100 to 999, and high from 1,000. Geometry, constraints and solver settings also affect difficulty; the combination count does not mean the solver must try every assignment.</p>
    </details>
  </section>;
}
