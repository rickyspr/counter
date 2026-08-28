import {
  calculateAge,
  fallbackDisplayName,
  fetchProfile,
  fetchTrainingStats,
  type TrainingStats,
  type UserProfile,
} from "@repcount/shared";
import { useEffect, useState } from "react";
import { Avatar } from "../components/Avatar";
import { useAuth } from "../lib/auth-context";
import { formatDuration, formatMonthYear, formatTotalVolume } from "../lib/format";
import { signAvatarUrl } from "../lib/media-urls";
import { supabase } from "../lib/supabase";

export function ProfilePage() {
  const { session } = useAuth();
  const userId = session!.user.id;

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [stats, setStats] = useState<TrainingStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.allSettled([fetchProfile(supabase, userId), fetchTrainingStats(supabase)])
      .then(async ([profileResult, statsResult]) => {
        if (cancelled) return;
        if (profileResult.status === "fulfilled") {
          setProfile(profileResult.value);
          const path = profileResult.value.avatarPath;
          setAvatarUrl(path ? await signAvatarUrl(path).catch(() => null) : null);
        }
        if (statsResult.status === "fulfilled") setStats(statsResult.value);
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
                value={`${profile.bodyWeightKg.toLocaleString("sv-SE")} kg`}
              />
            )}
            {profile?.heightCm != null && (
              <Detail label="Längd" value={`${profile.heightCm} cm`} />
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
                  value={formatTotalVolume(stats.totalVolumeKg)}
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

          <p className="text-muted">
            Profilen redigeras i mobilappen.
          </p>
        </>
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
