import React, { useEffect, useState } from "react";
import "./LoadingBar.css";

export default function LoadingBar() {
  const [active, setActive] = useState(false);

  useEffect(() => {
    const handler = (e) => setActive(e.detail);
    window.addEventListener("api-loading", handler);
    return () => window.removeEventListener("api-loading", handler);
  }, []);

  return (
    <div className={`loading-bar${active ? " loading-bar--active" : ""}`} />
  );
}
