import { useEffect, useState } from "react";

interface ConsultantUtilization3DProps {
  utilization: number;
  target: number;
}

export function ConsultantUtilization3D({ utilization, target }: ConsultantUtilization3DProps) {
  const [reducedMotion, setReducedMotion] = useState(false);
  const clamped = Math.max(0, Math.min(100, utilization));
  const circumference = 2 * Math.PI * 62;
  const dashOffset = circumference - (clamped / 100) * circumference;

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return (
    <div className={`utilization-3d ${reducedMotion ? "is-static" : ""}`} aria-label={`Average utilization ${clamped.toFixed(1)} percent against a ${target} percent target`}>
      <div className="utilization-3d__shadow" aria-hidden="true" />
      <div className="utilization-3d__stage" aria-hidden="true">
        <svg viewBox="0 0 160 160" role="img">
          <defs>
            <linearGradient id="utilization-ring" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#5ad6c8" />
              <stop offset="55%" stopColor="#0F9D91" />
              <stop offset="100%" stopColor="#086d68" />
            </linearGradient>
            <filter id="ring-shadow" x="-30%" y="-30%" width="160%" height="160%">
              <feDropShadow dx="0" dy="7" stdDeviation="6" floodColor="#091322" floodOpacity="0.22" />
            </filter>
          </defs>
          <circle className="ring-back" cx="80" cy="80" r="62" />
          <circle className="ring-track" cx="80" cy="80" r="62" />
          <circle className="ring-progress" cx="80" cy="80" r="62" stroke="url(#utilization-ring)" strokeDasharray={circumference} strokeDashoffset={dashOffset} filter="url(#ring-shadow)" />
          <circle className="ring-inner" cx="80" cy="80" r="48" />
        </svg>
        <div className="utilization-3d__core">
          <span className="utilization-3d__value">{clamped.toFixed(1)}%</span>
          <span className="utilization-3d__label">Average</span>
        </div>
      </div>
      <div className="utilization-3d__legend">
        <span className="legend-dot" />
        <span>Target {target}%</span>
      </div>
    </div>
  );
}
