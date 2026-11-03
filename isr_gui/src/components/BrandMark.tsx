import Image from "next/image";
import logo from "../../assets/1. Primary Logo (Use this first)/Additional Colours/Teal - Light/QuantumDice_Logo_TealLight_Gradient.png";

export function BrandMark() {
  // Serve the bundled asset directly: /_next/image is not exposed by the service routing.
  return <div className="brand-mark"><Image src={logo} alt="Quantum Dice" width={4500} height={4500} unoptimized preload /></div>;
}
