import {
  calculateAge,
  fallbackDisplayName,
  fetchFirstWorkoutStartedAt,
  fetchProfile,
  fetchTrainingStats,
  toLocalDateOnly,
  type TrainingStats,
  type UserProfile,
} from "@counter/shared";
import { useEffect, useState } from "react";
import { Avatar } from "../components/Avatar";
import { WorkoutExportDialog } from "../components/WorkoutExportDialog";
import { useAuth } from "../lib/auth-context";
import {
  formatDuration,
  formatHeight,
  formatMonthYear,
  formatTotalVolume,
  formatWeight,
  unitLabel,
} from "../lib/format";
import { useUnit } from "../lib/unit-context";
import { signAvatarUrl } from "../lib/media-urls";
import { supabase } from "../lib/supabase";

export function ProfilePage() {
  const { session } = useAuth();
  const userId = session!.user.id;
  const unit = useUnit();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [stats, setStats] = useState<TrainingStats | null>(null);
  const [firstWorkoutStartedAt, setFirstWorkoutStartedAt] = useState<
    string | null
  >(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.allSettled([
      fetchProfile(supabase, userId),
      fetchTrainingStats(supabase),
      fetchFirstWorkoutStartedAt(supabase, userId),
    ])
      .then(async ([profileResult, statsResult, firstWorkoutResult]) => {
        if (cancelled) return;
        if (profileResult.status === "fulfilled") {
          setProfile(profileResult.value);
          const path = profileResult.value.avatarPath;
          setAvatarUrl(path ? await signAvatarUrl(path).catch(() => null) : null);
        }
        if (statsResult.status === "fulfilled") setStats(statsResult.value);
        if (firstWorkoutResult.status === "fulfilled") {
          setFirstWorkoutStartedAt(firstWorkoutResult.value);
        }
        // Ett avvisat tredje resultat ska inte ge felmeddelande - då
        // faller från-datumet bara tillbaka på "medlem sedan".
        const failure = [profileResult, statsResult].find(
          (r) => r.status === "rejected",
        );
        if (failure?.status === "rejected") {
          setError(
            failure.reason instanceof Error
              ? failure.reason.message
              : "Kunde inte hämta allt.",
          );
        }
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const fallbackName = fallbackDisplayName(session!);
  const memberSince = profile?.createdAt ?? session!.user.created_at;
  const age = profile?.birthDate ? calculateAge(profile.birthDate) : null;

  return (
    <div className="page">
      <h1>Profil</h1>

      {error && <p className="status error">{error}</p>}

      {loading ? (
        <p className="status">Laddar…</p>
      ) : (
        <>
          <section className="card">
            <div className="identity-row">
              <Avatar uri={avatarUrl} name={fallbackName} size={72} />
              <div>
                <p className="identity-name">
                  {profile?.displayName ?? fallbackName}
                </p>
                <p className="text-muted">{session!.user.email}</p>
                <p className="text-muted">
                  Medlem sedan {formatMonthYear(memberSince)}
                </p>
              </div>
            </div>

            {profile?.homeGym && (
              <Detail label="Hemgym" value={profile.homeGym} />
            )}
            {age !== null && <Detail label="Ålder" value={`${age} år`} />}
            {profile?.bodyWeightKg != null && (
              <Detail
                label="Vikt"
                value={formatWeight(profile.bodyWeightKg, unit)}
              />
            )}
            {profile?.heightCm != null && (
              <Detail label="Längd" value={formatHeight(profile.heightCm, unit)} />
            )}
            {profile?.bio && <p className="bio">{profile.bio}</p>}
          </section>

          <section className="card">
            <h2>Din träning</h2>
            {stats ? (
              <div className="stat-grid">
                <Stat label="Pass" value={String(stats.workoutCount)} />
                <Stat
                  label="Total volym"
                  value={formatTotalVolume(stats.totalVolumeKg, unit)}
                />
                <Stat
                  label="Total tid"
                  value={formatDuration(stats.totalMinutes)}
                />
              </div>
            ) : (
              <p className="status">Ingen statistik ännu.</p>
            )}
          </section>

          {(stats?.workoutCount ?? 0) > 0 && (
            <section className="card">
              <h2>Exportera träningsdata</h2>
              <p className="text-muted">
                Ladda ner din historik som CSV – en rad per set, vikter i{" "}
                {unitLabel(unit)}.
              </p>
              <button
                type="button"
                className="button-secondary"
                onClick={() => setExportOpen(true)}
              >
                Exportera träningsdata
              </button>
            </section>
          )}

          <p className="text-muted">
            Profilen och enhetsvalet (kg/lbs) ändras i mobilappen.
          </p>
        </>
      )}

      {exportOpen && (
        <WorkoutExportDialog
          userId={userId}
          defaultFromDate={toLocalDateOnly(firstWorkoutStartedAt ?? memberSince)}
          onClose={() => setExportOpen(false)}
        />
      )}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="detail-row">
      <span className="text-muted">{label}</span>
      <span>{value}</span>
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
