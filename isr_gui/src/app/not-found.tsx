import Link from "next/link";

export default function NotFound() {
  return <main className="fatal"><div><div className="eyebrow">404</div><h1>That mission view does not exist.</h1><Link className="button primary" href="/">Return to presentation</Link></div></main>;
}
