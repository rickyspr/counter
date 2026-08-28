import type { WeeklyTrainingPoint } from "@repcount/shared";
import { useState } from "react";
import { formatVolume, formatWeek } from "../lib/format";

interface Props {
  points: WeeklyTrainingPoint[];
  metric: "volume" | "count";
}

const WIDTH = 640;
const HEIGHT = 220;
const PADDING = { top: 16, right: 16, bottom: 28, left: 48 };

// Single-series magnitude-over-time. One hue (the already-validated
// --chart-series-1 token, same as ProgressionChart), bars anchored to the
// baseline with rounded tops, a 2px surface gap between them, per-bar
// hover, and a table fallback - per the dataviz procedure.
export function WeeklyVolumeChart({ points, metric }: Props) {
  const [hover, setHover] = useState<number | null>(null);

  if (points.length === 0) {
    return <p className="status">Inga avslutade pass ännu.</p>;
  }

  const plotWidth = WIDTH - PADDING.left - PADDING.right;
  const plotHeight = HEIGHT - PADDING.top - PADDING.bottom;

  const valueOf = (p: WeeklyTrainingPoint) =>
    metric === "volume" ? p.volumeKg : p.workoutCount;
  const label = (v: number) =>
    metric === "volume" ? formatVolume(v) : `${v} pass`;

  const maxValue = Math.max(...points.map(valueOf), 1);
  const step = plotWidth / points.length;
  const barWidth = Math.max(Math.min(step - 6, 40), 2);

  const ticks = [0, 0.5, 1].map((f) => Math.round(maxValue * f));
  const yFor = (v: number) =>
    PADDING.top + plotHeight - (v / maxValue) * plotHeight;

  const hovered = hover !== null ? points[hover] : null;

  return (
    <div className="progression-chart">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={
          metric === "volume" ? "Volym per vecka" : "Antal pass per vecka"
        }
      >
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={PADDING.left}
              x2={WIDTH - PADDING.right}
              y1={yFor(tick)}
              y2={yFor(tick)}
              className="chart-gridline"
            />
            <text
              x={PADDING.left - 8}
              y={yFor(tick)}
              className="chart-axis-label"
              textAnchor="end"
              dominantBaseline="middle"
            >
              {metric === "volume" && tick >= 1000
                ? `${Math.round(tick / 1000)}k`
                : tick}
            </text>
          </g>
        ))}

        {points.map((p, i) => {
          const value = valueOf(p);
          const x = PADDING.left + i * step + (step - barWidth) / 2;
          const y = yFor(value);
          const h = PADDING.top + plotHeight - y;
          return (
            <rect
              key={p.weekStart}
              x={x}
              y={y}
              width={barWidth}
              height={Math.max(h, 0)}
              rx={3}
              className="chart-bar"
              opacity={hover === null || hover === i ? 1 : 0.5}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            />
          );
        })}

        {points.length > 1 && (
          <>
            <text
              x={PADDING.left}
              y={HEIGHT - 6}
              className="chart-axis-label"
              textAnchor="start"
            >
              {formatWeek(points[0]!.weekStart)}
            </text>
            <text
              x={WIDTH - PADDING.right}
              y={HEIGHT - 6}
              className="chart-axis-label"
              textAnchor="end"
            >
              {formatWeek(points[points.length - 1]!.weekStart)}
            </text>
          </>
        )}
      </svg>

      {hovered && (
        <div className="chart-tooltip">
          <strong>{label(valueOf(hovered))}</strong>
          <span>Vecka {formatWeek(hovered.weekStart)}</span>
        </div>
      )}

      <details className="chart-table-toggle">
        <summary>Visa som tabell</summary>
        <table>
          <thead>
            <tr>
              <th>Vecka</th>
              <th>{metric === "volume" ? "Volym" : "Antal pass"}</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.weekStart}>
                <td>{formatWeek(p.weekStart)}</td>
                <td>{label(valueOf(p))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
