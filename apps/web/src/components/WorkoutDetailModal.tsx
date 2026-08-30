import type {
  HistoryExercise,
  MediaItem,
  WorkoutSummary,
} from "@counter/shared";
import { useEffect, useState } from "react";
import { formatDateTime, formatVolume } from "../lib/format";
import { Avatar } from "./Avatar";
import { MediaViewer } from "./MediaViewer";

export interface WorkoutDetailEntry {
  id: string;
  name: string | null;
  startedAt: string;
  summary: WorkoutSummary;
  exercises: HistoryExercise[];
}

interface Props {
  entry: WorkoutDetailEntry | null;
  mediaItems: MediaItem[];
  onClose: () => void;
  author?: { name: string; avatarUrl: string | null; onOpen: () => void };
  kudos?: { count: number; givenByMe: boolean; onToggle: () => void };
}

// Renders only from data the list already fetched - a workout's sets ride
// along in the history/feed query, so opening the detail view makes no
// network request of its own.
export function WorkoutDetailModal({
  entry,
  mediaItems,
  onClose,
  author,
  kudos,
}: Props) {
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  useEffect(() => {
    setViewerIndex(null);
    if (!entry) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [entry, onClose]);

  if (!entry) return null;

  return (
    <div
      className="dialog-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="dialog" role="dialog" aria-modal="true">
        <div className="dialog-header">
          <h2>{entry.name ?? "Pass"}</h2>
          <button type="button" className="link-button" onClick={onClose}>
            Stäng
          </button>
        </div>

        <div className="dialog-body">
          {author && (
            <button type="button" className="author-row" onClick={author.onOpen}>
              <Avatar uri={author.avatarUrl} name={author.name} size={32} />
              <span className="author-name">{author.name}</span>
            </button>
          )}

          <p className="detail-date">{formatDateTime(entry.startedAt)}</p>

          {kudos && (
            <button
              type="button"
              className={
                kudos.givenByMe
                  ? "kudos-button kudos-button-active"
                  : "kudos-button"
              }
              onClick={kudos.onToggle}
              aria-pressed={kudos.givenByMe}
            >
              {kudos.givenByMe ? "★ Peppad" : "☆ Peppa"}
              {kudos.count > 0 ? ` (${kudos.count})` : ""}
            </button>
          )}

          <div className="summary-grid">
            <Summary
              label="Volym"
              value={formatVolume(entry.summary.totalVolumeKg)}
            />
            <Summary label="Set" value={String(entry.summary.setCount)} />
            <Summary
              label="Övningar"
              value={String(entry.summary.exerciseCount)}
            />
            <Summary
              label="Längd"
              value={
                entry.summary.durationMinutes !== null
                  ? `${entry.summary.durationMinutes} min`
                  : "-"
              }
            />
          </div>

          {mediaItems.length > 0 && (
            <div className="detail-media">
              {mediaItems.map((item, i) => (
                <button
                  key={item.id}
                  type="button"
                  className="detail-media-tile"
                  onClick={() => setViewerIndex(i)}
                  aria-label={
                    item.mediaType === "video" ? "Öppna video" : "Öppna bild"
                  }
                >
                  {item.mediaType === "image" && item.uri ? (
                    <img src={item.uri} alt="" />
                  ) : item.mediaType === "video" && item.uri ? (
                    <video src={item.uri} preload="metadata" muted playsInline />
                  ) : (
                    <span className="media-placeholder" />
                  )}
                  {item.mediaType === "video" && (
                    <span className="media-play" aria-hidden="true">
                      ▶
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

          {entry.exercises.length === 0 ? (
            <p className="status">Inga övningar i passet.</p>
          ) : (
            entry.exercises.map((exercise) => (
              <div key={exercise.workoutExerciseId} className="detail-exercise">
                <h3>{exercise.name}</h3>
                {exercise.sets.length === 0 ? (
                  <p className="status">Inga set.</p>
                ) : (
                  exercise.sets.map((set, i) => (
                    <div key={i} className="detail-set">
                      <span className="detail-set-label">Set {i + 1}</span>
                      <span>
                        {set.weightKg.toLocaleString("sv-SE")} kg × {set.reps}
                      </span>
                    </div>
                  ))
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {viewerIndex !== null && (
        <MediaViewer
          items={mediaItems}
          initialIndex={viewerIndex}
          onClose={() => setViewerIndex(null)}
        />
      )}
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="summary">
      <span className="summary-value">{value}</span>
      <span className="summary-label">{label}</span>
    </div>
  );
}
