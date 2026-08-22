import { MAX_MEDIA_PER_WORKOUT } from "@repcount/shared";
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { formatMediaDuration, type MediaItem } from "../lib/media-item";

interface Props {
  items: MediaItem[];
  // Utelämnas i detaljvyn, som bara visar. Att skicka in dem är vad som
  // gör remsan redigerbar - det finns inget separat "readOnly"-läge att
  // råka sätta fel.
  onAdd?: () => void;
  onRemove?: (item: MediaItem) => void;
  onOpen: (index: number) => void;
}

// Ren presentation, samma uppdelning som ExerciseSection: all state och
// alla skrivningar ligger kvar i skärmen som använder komponenten.
//
// Videor visas som en mörk ruta med spelsymbol och längd, inte som en
// genererad förhandsbild. En förhandsbild hade krävt ett andra objekt i
// Storage per video, med egen uppladdning och egen städning vid
// radering - för en ruta som ändå bara ska tryckas på.
export function MediaStrip({ items, onAdd, onRemove, onOpen }: Props) {
  const full = items.length >= MAX_MEDIA_PER_WORKOUT;

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <Text style={styles.title}>Bilder & video</Text>
        {onAdd && (
          <Text style={styles.counter}>
            {items.length}/{MAX_MEDIA_PER_WORKOUT}
          </Text>
        )}
      </View>

      {items.length === 0 && !onAdd ? (
        <Text style={styles.emptyText}>Inga bilder eller videor.</Text>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.strip}
          // Utan detta går första trycket på en ruta åt till att stänga
          // tangentbordet - samma fälla som ScrollViewarna i skärmarna.
          keyboardShouldPersistTaps="handled"
        >
          {items.map((item, index) => (
            <View key={item.id} style={styles.tileWrap}>
              <TouchableOpacity
                style={styles.tile}
                onPress={() => onOpen(index)}
                accessibilityLabel={
                  item.mediaType === "video" ? "Öppna video" : "Öppna bild"
                }
              >
                {item.mediaType === "image" && item.uri ? (
                  <Image source={{ uri: item.uri }} style={styles.image} />
                ) : (
                  <View style={styles.videoTile}>
                    {item.mediaType === "video" && (
                      <Text style={styles.playIcon}>▶</Text>
                    )}
                  </View>
                )}

                {item.mediaType === "video" &&
                  formatMediaDuration(item.durationMs) && (
                    <View style={styles.durationBadge}>
                      <Text style={styles.durationText}>
                        {formatMediaDuration(item.durationMs)}
                      </Text>
                    </View>
                  )}

                {item.pending && (
                  <View style={styles.pendingOverlay}>
                    <ActivityIndicator color="#fff" />
                  </View>
                )}
              </TouchableOpacity>

              {onRemove && (
                <TouchableOpacity
                  style={styles.removeButton}
                  accessibilityLabel="Ta bort media"
                  onPress={() => onRemove(item)}
                >
                  <Text style={styles.removeButtonText}>✕</Text>
                </TouchableOpacity>
              )}
            </View>
          ))}

          {onAdd && !full && (
            <TouchableOpacity style={styles.addTile} onPress={onAdd}>
              <Text style={styles.addTileText}>+</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      )}

      {onAdd && full && (
        <Text style={styles.emptyText}>
          Max {MAX_MEDIA_PER_WORKOUT} filer per pass. Ta bort något för att
          lägga till mer.
        </Text>
      )}
    </View>
  );
}

const TILE = 96;

const styles = StyleSheet.create({
  section: {
    backgroundColor: "#f3f4f6",
    borderRadius: 12,
    padding: 16,
    gap: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
  },
  counter: {
    color: "#6b7280",
    fontSize: 13,
  },
  emptyText: {
    color: "#6b7280",
  },
  strip: {
    flexDirection: "row",
    gap: 8,
    // Rum åt ✕-knappen, som sticker ut över rutans hörn.
    paddingTop: 6,
    paddingRight: 6,
  },
  tileWrap: {
    width: TILE,
    height: TILE,
  },
  tile: {
    width: TILE,
    height: TILE,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "#e5e7eb",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  videoTile: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1f2937",
  },
  playIcon: {
    color: "#fff",
    fontSize: 26,
  },
  durationBadge: {
    position: "absolute",
    right: 4,
    bottom: 4,
    backgroundColor: "rgba(0,0,0,0.65)",
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  durationText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "600",
  },
  pendingOverlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  removeButton: {
    position: "absolute",
    top: -6,
    right: -6,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  removeButtonText: {
    color: "#b91c1c",
    fontSize: 13,
    fontWeight: "700",
  },
  addTile: {
    width: TILE,
    height: TILE,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#9ca3af",
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
  addTileText: {
    color: "#374151",
    fontSize: 28,
    fontWeight: "600",
  },
});
