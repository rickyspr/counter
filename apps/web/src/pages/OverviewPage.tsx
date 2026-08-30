import {
  fetchExercisePersonalBests,
  fetchExerciseProgression,
  fetchTrainingStats,
  fetchWeeklyTrainingSeries,
  type ExercisePersonalBest,
  type ExerciseProgressionPoint,
  type TrainingStats,
  type WeeklyTrainingPoint,
} from "@counter/shared";
import { useEffect, useState } from "react";
import { ProgressionChart } from "../components/ProgressionChart";
import { WeeklyVolumeChart } from "../components/WeeklyVolumeChart";
import { formatDuration, formatTotalVolume } from "../lib/format";
import { supabase } from "../lib/supabase";

export function OverviewPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<TrainingStats | null>(null);
  const [weekly, setWeekly] = useState<WeeklyTrainingPoint[]>([]);
  const [bests, setBests] = useState<ExercisePersonalBest[]>([]);

  const [selectedExerciseId, setSelectedExerciseId] = useState<string | null>(
    null,
  );
  const [progression, setProgression] = useState<ExerciseProgressionPoint[]>([]);
  const [progressionLoading, setProgressionLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      fetchTrainingStats(supabase),
      fetchWeeklyTrainingSeries(supabase),
      fetchExercisePersonalBests(supabase),
    ])
      .then(([statsResult, weeklyResult, bestsResult]) => {
        if (cancelled) return;
        setStats(statsResult);
        setWeekly(weeklyResult);
        setBests(bestsResult);
        setSelectedExerciseId(bestsResult[0]?.exerciseId ?? null);
      })
      .catch((err) =>
        !cancelled &&
        setError(err instanceof Error ? err.message : "Kunde inte hämta statistik."),
      )
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedExerciseId) {
      setProgression([]);
      return;
    }
    let cancelled = false;
    setProgressionLoading(true);
    fetchExerciseProgression(supabase, selectedExerciseId)
      .then((points) => !cancelled && setProgression(points))
      .catch(() => !cancelled && setProgression([]))
      .finally(() => !cancelled && setProgressionLoading(false));
    return () => {
      cancelled = true;
    };
  }, [selectedExerciseId]);

  if (loading) return <p className="status">Laddar…</p>;
  if (error) return <p className="status error">{error}</p>;

  const selectedBest = bests.find((b) => b.exerciseId === selectedExerciseId);
  const hasData = (stats?.workoutCount ?? 0) > 0;

  return (
    <div className="page">
      <h1>Översikt</h1>

      {!hasData ? (
        <p className="status">
          Inga avslutade pass ännu. Logga ett pass i mobilappen för att se
          statistik här.
        </p>
      ) : (
        <>
          <section className="card">
            <h2>Din träning</h2>
            <div className="stat-grid">
              <Stat label="Pass" value={String(stats!.workoutCount)} />
              <Stat
                label="Total volym"
                value={formatTotalVolume(stats!.totalVolumeKg)}
              />
              <Stat
                label="Total tid"
                value={formatDuration(stats!.totalMinutes)}
              />
            </div>
          </section>

          <section>
            <h2>Volym per vecka</h2>
            <WeeklyVolumeChart points={weekly} metric="volume" />
          </section>

          <section>
            <h2>Passfrekvens per vecka</h2>
            <WeeklyVolumeChart points={weekly} metric="count" />
          </section>

          <section>
            <div className="section-header">
              <h2>Progression per övning</h2>
              {bests.length > 0 && (
                <select
                  value={selectedExerciseId ?? ""}
                  onChange={(e) => setSelectedExerciseId(e.target.value)}
                >
                  {bests.map((b) => (
                    <option key={b.exerciseId} value={b.exerciseId}>
                      {b.exerciseName}
                    </option>
                  ))}
                </select>
              )}
            </div>
            {selectedBest && (
              <p className="text-muted">
                Tyngsta set {selectedBest.heaviestSetKg.toLocaleString("sv-SE")} kg
                {" · "}bästa e1RM {selectedBest.bestE1rmKg.toFixed(1)} kg
              </p>
            )}
            {progressionLoading ? (
              <p className="status">Laddar…</p>
            ) : (
              <ProgressionChart points={progression} />
            )}
          </section>

          <section>
            <h2>Personbästa per övning</h2>
            <table>
              <thead>
                <tr>
                  <th>Övning</th>
                  <th>Tyngsta set (kg)</th>
                  <th>Bästa e1RM (kg)</th>
                </tr>
              </thead>
              <tbody>
                {bests.map((b) => (
                  <tr key={b.exerciseId}>
                    <td>{b.exerciseName}</td>
                    <td>{b.heaviestSetKg.toLocaleString("sv-SE")}</td>
                    <td>{b.bestE1rmKg.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}
