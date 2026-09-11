"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <html><body><main className="fatal"><div><div className="eyebrow">Presentation unavailable</div><h1>Something interrupted the mission view.</h1><button className="button primary" onClick={reset}>Try again</button></div></main></body></html>;
}
