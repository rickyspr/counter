import { useRef, useState } from "react";
import {
  FlatList,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { formatMediaDuration, type MediaItem } from "../lib/media-item";

interface Props {
  items: MediaItem[];
  // Rutans bredd i punkter - hela kortets bredd minus dess egen ram, som
  // ProfileScreen räknar ut. Höjden härleds av ASPECT_RATIO nedan, så
  // varje pass i listan har samma höjd oavsett vad bilderna faktiskt
  // föreställer.
  width: number;
  onOpen: (index: number) => void;
}

// 4:3, beskuren (cover). Bilder är blandat stående och liggande, och en
// fast höjd för hela listan är det som gör historiken lugn att scrolla -
// se planen i konversationen för avvägningen mot att visa hela bilden.
const ASPECT_RATIO = 4 / 3;

// Ren presentation, kant i kant överst i passkortet. Ligger som ett eget
// litet komponent istället för att återanvändas från MediaStrip: den
// komponenten är en väljarremsa med egen kortchrome (rubrik, räknare,
// 96px-rutor) - annat jobb än en helbredds karusell i historiklistan.
export function WorkoutMediaCarousel({ items, width, onOpen }: Props) {
  const height = width / ASPECT_RATIO;
  const [index, setIndex] = useState(0);
  const list = useRef<FlatList<MediaItem>>(null);

  if (items.length === 0) return null;

  if (items.length === 1) {
    return (
      <Tile item={items[0]!} width={width} height={height} onPress={() => onOpen(0)} />
    );
  }

  return (
    <View style={{ width, height }}>
      <FlatList
        ref={list}
        data={items}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        // Bara den synliga rutan renderas i taget - passet kan ha upp
        // till tio filer, och en horisontell FlatList inuti profilens
        // vertikala FlatList är tillåtet: RN varnar bara för nästling i
        // SAMMA riktning.
        initialNumToRender={1}
        windowSize={3}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        onMomentumScrollEnd={(event) =>
          setIndex(Math.round(event.nativeEvent.contentOffset.x / width))
        }
        renderItem={({ item, index: itemIndex }) => (
          <Tile
            item={item}
            width={width}
            height={height}
            onPress={() => onOpen(itemIndex)}
          />
        )}
      />

      <View style={styles.dots}>
        {items.map((item, dotIndex) => (
          <View
            key={item.id}
            style={[styles.dot, dotIndex === index && styles.dotActive]}
          />
        ))}
      </View>
    </View>
  );
}

function Tile({
  item,
  width,
  height,
  onPress,
}: {
  item: MediaItem;
  width: number;
  height: number;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={{ width, height }}
      onPress={onPress}
      accessibilityLabel={item.mediaType === "video" ? "Öppna video" : "Öppna bild"}
    >
      {item.mediaType === "image" && item.uri ? (
        <Image source={{ uri: item.uri }} style={styles.image} resizeMode="cover" />
      ) : item.mediaType === "video" ? (
        // Samma mörka ruta med spelsymbol som MediaStrip, av samma skäl:
        // en genererad förhandsbild kräver ett andra Storage-objekt per
        // video, med egen uppladdning och egen städning.
        <View style={styles.videoTile}>
          <Text style={styles.playIcon}>▶</Text>
        </View>
      ) : (
        // uri är null: signerad URL har inte kommit än. Tom platshållare
        // i rätt storlek så att kortet inte hoppar när den landar.
        <View style={styles.placeholder} />
      )}

      {item.mediaType === "video" && formatMediaDuration(item.durationMs) && (
        <View style={styles.durationBadge}>
          <Text style={styles.durationText}>
            {formatMediaDuration(item.durationMs)}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
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
  placeholder: {
    flex: 1,
    backgroundColor: "#e5e7eb",
  },
  playIcon: {
    color: "#fff",
    fontSize: 32,
  },
  durationBadge: {
    position: "absolute",
    right: 8,
    bottom: 8,
    backgroundColor: "rgba(0,0,0,0.65)",
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  durationText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  dots: {
    position: "absolute",
    bottom: 8,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    gap: 5,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.5)",
  },
  dotActive: {
    backgroundColor: "#fff",
  },
});
