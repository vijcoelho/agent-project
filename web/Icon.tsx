import type { CSSProperties } from "react";

const paths = {
  cockpit: "M4 17 9 5h6l5 12M7 12h10M10 17h4",
  grid: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z",
  folder: "M3 7V5h6l2 2h10v13H3z",
  plus: "M12 5v14M5 12h14",
  arrow: "M5 12h14M13 6l6 6-6 6",
  search: "M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14M15 15l6 6",
  settings: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2",
  terminal: "m5 7 5 5-5 5M13 17h6",
  team: "M9 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6M3 20v-4a6 6 0 0 1 12 0v4M17 4a3 3 0 0 1 0 6M18 13a5 5 0 0 1 3 5v2",
  memory: "M5 4h14v16H5zM9 8h6M9 12h6M9 16h3",
  chart: "M4 3v17h17M8 16v-5M13 16V7M18 16V4",
  menu: "M4 6h16M4 12h16M4 18h16",
};

export function Icon({ name, size = 18, style }: { name: keyof typeof paths; size?: number; style?: CSSProperties }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={style}><path d={paths[name]} /></svg>;
}
