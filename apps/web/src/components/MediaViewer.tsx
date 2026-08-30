import type { MediaItem } from "@counter/shared";
import { useEffect, useState } from "react";

interface Props {
  items: MediaItem[];
  initialIndex: number;
  onClose: () => void;
}

// Full-screen overlay for a single image/video, with keyboard + on-screen
// navigation between the workout's media.
export function MediaViewer({ items, initialIndex, onClose }: Props) {
  const [index, setIndex] = useState(initialIndex);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setIndex((i) => Math.min(i + 1, items.length - 1));
      if (e.key === "ArrowLeft") setIndex((i) => Math.max(i - 1, 0));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [items.length, onClose]);

  const item = items[index];
  if (!item) return null;

  return (
    <div
      className="viewer-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <button type="button" className="viewer-close" onClick={onClose}>
        Stäng
      </button>

      <div className="viewer-stage">
        {item.mediaType === "video" && item.uri ? (
          <video src={item.uri} controls autoPlay playsInline />
        ) : item.uri ? (
          <img src={item.uri} alt="" />
        ) : (
          <p className="status">Kunde inte ladda mediet.</p>
        )}
      </div>

      {items.length > 1 && (
        <div className="viewer-nav">
          <button
            type="button"
            disabled={index === 0}
            onClick={() => setIndex((i) => Math.max(i - 1, 0))}
          >
            ← Föregående
          </button>
          <span>
            {index + 1} / {items.length}
          </span>
          <button
            type="button"
            disabled={index === items.length - 1}
            onClick={() => setIndex((i) => Math.min(i + 1, items.length - 1))}
          >
            Nästa →
          </button>
        </div>
      )}
    </div>
  );
}
