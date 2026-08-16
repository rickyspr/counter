import type { ExerciseProgressionPoint } from "@repcount/shared";
import { useState, type PointerEvent } from "react";

interface Props {
  points: ExerciseProgressionPoint[];
}

const WIDTH = 640;
const HEIGHT = 240;
const PADDING = { top: 16, right: 16, bottom: 28, left: 44 };

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("sv-SE", {
    month: "short",
    day: "numeric",
  });
}

// Enkla, avrundade y-axelvärden mellan min och max.
function niceTicks(min: number, max: number, count = 4): number[] {
  if (min === max) return [Math.round(min)];
  const step = (max - min) / (count - 1);
  return Array.from({ length: count }, (_, i) => Math.round(min + step * i));
}

export function ProgressionChart({ points }: Props) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  if (points.length === 0) {
    return <p className="status">Inga pass med den här övningen ännu.</p>;
  }

  const plotWidth = WIDTH - PADDING.left - PADDING.right;
  const plotHeight = HEIGHT - PADDING.top - PADDING.bottom;

  const values = points.map((p) => p.bestE1rmKg);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const valueRange = maxValue - minValue || 1;
  const yMin = minValue - valueRange * 0.15;
  const yMax = maxValue + valueRange * 0.15;

  function xFor(index: number): number {
    if (points.length === 1) return PADDING.left + plotWidth / 2;
    return PADDING.left + (index / (points.length - 1)) * plotWidth;
  }

  function yFor(value: number): number {
    return (
      PADDING.top + plotHeight - ((value - yMin) / (yMax - yMin)) * plotHeight
    );
  }

  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${xFor(i)} ${yFor(p.bestE1rmKg)}`)
    .join(" ");

  const yTicks = niceTicks(yMin, yMax, 4);
  const hovered = hoverIndex !== null ? points[hoverIndex] : null;

  function handlePointerMove(event: PointerEvent<SVGRectElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const relativeX = event.clientX - rect.left;
    const ratio = points.length === 1 ? 0 : relativeX / rect.width;
    const index = Math.round(ratio * (points.length - 1));
    setHoverIndex(Math.min(Math.max(index, 0), points.length - 1));
  }

  return (
    <div className="progression-chart">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label="Progression (e1RM) för vald övning"
      >
        {yTicks.map((tick) => (
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
              {tick}
            </text>
          </g>
        ))}

        <path d={linePath} className="chart-line" fill="none" />

        {points.map((p, i) => (
          <circle
            key={p.workoutStartedAt}
            cx={xFor(i)}
            cy={yFor(p.bestE1rmKg)}
            r={i === points.length - 1 || i === hoverIndex ? 5 : 4}
            className="chart-dot"
          />
        ))}

        {points.length > 1 && (
          <>
            <text
              x={xFor(0)}
              y={HEIGHT - 6}
              className="chart-axis-label"
              textAnchor="start"
            >
              {formatDate(points[0]!.workoutStartedAt)}
            </text>
            <text
              x={xFor(points.length - 1)}
              y={HEIGHT - 6}
              className="chart-axis-label"
              textAnchor="end"
            >
              {formatDate(points[points.length - 1]!.workoutStartedAt)}
            </text>
          </>
        )}

        {hovered && hoverIndex !== null && (
          <line
            x1={xFor(hoverIndex)}
            x2={xFor(hoverIndex)}
            y1={PADDING.top}
            y2={HEIGHT - PADDING.bottom}
            className="chart-crosshair"
          />
        )}

        <rect
          x={PADDING.left}
          y={PADDING.top}
          width={plotWidth}
          height={plotHeight}
          fill="transparent"
          onPointerMove={handlePointerMove}
          onPointerLeave={() => setHoverIndex(null)}
        />
      </svg>

      {hovered && (
        <div className="chart-tooltip">
          <strong>{hovered.bestE1rmKg.toFixed(1)} kg e1RM</strong>
          <span>
            {formatDate(hovered.workoutStartedAt)} · tyngsta set{" "}
            {hovered.topWeightKg} kg
          </span>
        </div>
      )}

      <details className="chart-table-toggle">
        <summary>Visa som tabell</summary>
        <table>
          <thead>
            <tr>
              <th>Datum</th>
              <th>Tyngsta set (kg)</th>
              <th>e1RM (kg)</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.workoutStartedAt}>
                <td>{formatDate(p.workoutStartedAt)}</td>
                <td>{p.topWeightKg}</td>
                <td>{p.bestE1rmKg.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
