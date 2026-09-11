"use client";

import { useEffect, useState } from "react";

export function FullscreenButton() {
  const [active, setActive] = useState(false);

  useEffect(() => {
    const sync = () => setActive(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  const toggle = async () => {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  };

  return <button className="fullscreen-button" type="button" onClick={toggle} aria-label={active ? "Exit full screen" : "Enter full screen"} title={active ? "Exit full screen" : "Enter full screen"}>
    <span aria-hidden="true">{active ? "⊡" : "⛶"}</span><em>{active ? "Exit" : "Full screen"}</em>
  </button>;
}
