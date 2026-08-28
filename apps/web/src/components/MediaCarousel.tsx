import { formatMediaDuration, type MediaItem } from "@repcount/shared";
import { useRef, useState } from "react";

interface Props {
  items: MediaItem[];
  // Called when a tile is clicked - opens the full-size viewer at that index.
  onOpen: (index: number) => void;
}

// Full-bleed 4:3 cover carousel on top of a workout card, kant-i-kant with
// the card's rounded corners (the card clips it with overflow:hidden).
// Mirrors mobile's WorkoutMediaCarousel: a fixed aspect ratio keeps a long
// history list calm to scroll regardless of what the photos actually show.
export function MediaCarousel({ items, onOpen }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);

  if (items.length === 0) return null;

  function onScroll() {
    const track = trackRef.current;
    if (!track || track.clientWidth === 0) return;
    setIndex(Math.round(track.scrollLeft / track.clientWidth));
  }

  return (
    <div className="media-carousel">
      <div className="media-track" ref={trackRef} onScroll={onScroll}>
        {items.map((item, i) => (
          <button
            key={item.id}
            type="button"
            className="media-tile"
            onClick={() => onOpen(i)}
            aria-label={item.mediaType === "video" ? "Öppna video" : "Öppna bild"}
          >
            {item.mediaType === "image" && item.uri ? (
              <img src={item.uri} alt="" />
            ) : item.mediaType === "video" && item.uri ? (
              // Poster frame only; playback happens in the viewer. preload
              // metadata so the first frame shows without fetching the clip.
              <video src={item.uri} preload="metadata" muted playsInline />
            ) : (
              <span className="media-placeholder" />
            )}
            {item.mediaType === "video" && (
              <span className="media-play" aria-hidden="true">
                ▶
              </span>
            )}
            {item.mediaType === "video" &&
              formatMediaDuration(item.durationMs) && (
                <span className="media-duration">
                  {formatMediaDuration(item.durationMs)}
                </span>
              )}
          </button>
        ))}
      </div>

      {items.length > 1 && (
        <div className="media-dots">
          {items.map((item, i) => (
            <span
              key={item.id}
              className={i === index ? "media-dot media-dot-active" : "media-dot"}
            />
          ))}
        </div>
      )}
    </div>
  );
}
