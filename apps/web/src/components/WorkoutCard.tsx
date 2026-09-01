import type { MediaItem, WorkoutSummary } from "@counter/shared";
import { formatDate, formatVolume } from "../lib/format";
import { useUnit } from "../lib/unit-context";
import { Avatar } from "./Avatar";
import { MediaCarousel } from "./MediaCarousel";

export interface WorkoutCardEntry {
  id: string;
  name: string | null;
  startedAt: string;
  summary: WorkoutSummary;
  exercises: { name: string }[];
  kudosCount: number;
}

interface Author {
  name: string;
  avatarUrl: string | null;
  // Missing on a friend's own profile page - the row is then just a label.
  onOpen?: () => void;
}

interface Kudos {
  givenByMe: boolean;
  onToggle: () => void;
}

interface Props {
  entry: WorkoutCardEntry;
  mediaItems: MediaItem[];
  onOpenDetail: () => void;
  onOpenMedia: (index: number) => void;
  author?: Author;
  // A toggle button (feed / friend profile). Own history passes nothing and
  // only the count line below is shown.
  kudos?: Kudos;
}

export function WorkoutCard({
  entry,
  mediaItems,
  onOpenDetail,
  onOpenMedia,
  author,
  kudos,
}: Props) {
  const unit = useUnit();
  const exerciseNames = [...new Set(entry.exercises.map((e) => e.name))];

  return (
    <article className="workout-card">
      {author &&
        (author.onOpen ? (
          <button type="button" className="author-row" onClick={author.onOpen}>
            <Avatar uri={author.avatarUrl} name={author.name} size={32} />
            <span className="author-name">{author.name}</span>
          </button>
        ) : (
          <div className="author-row">
            <Avatar uri={author.avatarUrl} name={author.name} size={32} />
            <span className="author-name">{author.name}</span>
          </div>
        ))}

      <MediaCarousel items={mediaItems} onOpen={onOpenMedia} />

      <button type="button" className="workout-card-body" onClick={onOpenDetail}>
        <div className="workout-card-top">
          <span className="workout-card-title">
            {entry.name ?? formatDate(entry.startedAt)}
          </span>
          <span className="workout-card-volume">
            {formatVolume(entry.summary.totalVolumeKg, unit)}
          </span>
        </div>
        {entry.name !== null && (
          <span className="workout-card-meta">{formatDate(entry.startedAt)}</span>
        )}
        {exerciseNames.length > 0 && (
          <span className="workout-card-exercises">{exerciseNames.join(", ")}</span>
        )}
        <span className="workout-card-meta">
          {entry.summary.setCount} set · {entry.summary.exerciseCount}{" "}
          {entry.summary.exerciseCount === 1 ? "övning" : "övningar"}
          {entry.summary.durationMinutes !== null
            ? ` · ${entry.summary.durationMinutes} min`
            : ""}
        </span>
        {!kudos && entry.kudosCount > 0 && (
          <span className="workout-card-meta">★ {entry.kudosCount} peppa</span>
        )}
      </button>

      {kudos && (
        <button
          type="button"
          className={
            kudos.givenByMe ? "kudos-button kudos-button-active" : "kudos-button"
          }
          onClick={kudos.onToggle}
          aria-pressed={kudos.givenByMe}
        >
          {kudos.givenByMe ? "★ Peppad" : "☆ Peppa"}
          {entry.kudosCount > 0 ? ` (${entry.kudosCount})` : ""}
        </button>
      )}
    </article>
  );
}
