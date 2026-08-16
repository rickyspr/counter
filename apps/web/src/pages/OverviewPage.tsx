import {
  personalBestForExercise,
  volumePerWeek,
  workoutFrequencyPerWeek,
  type SetRecord,
} from "@repcount/shared";
import { useEffect, useState } from "react";
import { useAuth } from "../lib/auth-context";
import { fetchAllSetsForUser, fetchExerciseNames } from "../lib/queries";
import { supabase } from "../lib/supabase";

interface PersonalBestRow {
  exerciseId: string;
  exerciseName: string;
  heaviestSetKg: number;
  bestE1rmKg: number;
}

export function OverviewPage() {
  const { session } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sets, setSets] = useState<SetRecord[]>([]);
  const [exerciseNames, setExerciseNames] = useState<Map<string, string>>(
    new Map(),
  );

  useEffect(() => {
    if (!session) return;
    setLoading(true);
    setError(null);
    fetchAllSetsForUser(session.user.id)
      .then(async (fetchedSets) => {
        setSets(fetchedSets);
        const exerciseIds = Array.from(
          new Set(fetchedSets.map((s) => s.exercise_id)),
        );
        const names = await fetchExerciseNames(exerciseIds);
        setExerciseNames(new Map(names.map((n) => [n.id, n.name])));
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Okänt fel."))
      .finally(() => setLoading(false));
  }, [session]);

  if (loading) return <p className="status">Laddar…</p>;
  if (error) return <p className="status error">{error}</p>;

  const weeklyVolume = volumePerWeek(sets);

  const workoutStartedAtTimestamps = Array.from(
    new Map(sets.map((s) => [s.workout_id, s.workout_started_at])).values(),
  );
  const weeklyFrequency = workoutFrequencyPerWeek(workoutStartedAtTimestamps);

  const exerciseIds = Array.from(new Set(sets.map((s) => s.exercise_id)));
  const personalBests: PersonalBestRow[] = exerciseIds
    .map((exerciseId) => {
      const pb = personalBestForExercise(sets, exerciseId);
      if (!pb) return null;
      return {
        exerciseId,
        exerciseName: exerciseNames.get(exerciseId) ?? exerciseId,
        ...pb,
      };
    })
    .filter((row): row is PersonalBestRow => row !== null)
    .sort((a, b) => a.exerciseName.localeCompare(b.exerciseName));

  return (
    <div className="overview-page">
      <header className="overview-header">
        <h1>RepCount</h1>
        <button type="button" className="link-button" onClick={() => supabase.auth.signOut()}>
          Logga ut
        </button>
      </header>

      {sets.length === 0 ? (
        <p className="status">
          Inga avslutade pass ännu. Logga ett pass i mobilappen för att se
          statistik här.
        </p>
      ) : (
        <>
          <section>
            <h2>Volym per vecka</h2>
            <table>
              <thead>
                <tr>
                  <th>Vecka</th>
                  <th>Volym (kg)</th>
                </tr>
              </thead>
              <tbody>
                {weeklyVolume.map((row) => (
                  <tr key={row.weekStart}>
                    <td>{row.weekStart}</td>
                    <td>{row.volumeKg}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section>
            <h2>Passfrekvens</h2>
            <table>
              <thead>
                <tr>
                  <th>Vecka</th>
                  <th>Antal pass</th>
                </tr>
              </thead>
              <tbody>
                {weeklyFrequency.map((row) => (
                  <tr key={row.weekStart}>
                    <td>{row.weekStart}</td>
                    <td>{row.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
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
                {personalBests.map((row) => (
                  <tr key={row.exerciseId}>
                    <td>{row.exerciseName}</td>
                    <td>{row.heaviestSetKg}</td>
                    <td>{row.bestE1rmKg.toFixed(1)}</td>
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
