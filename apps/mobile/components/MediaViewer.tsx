import { useVideoPlayer, VideoView } from "expo-video";
import { useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { MediaItem } from "../lib/media-item";

interface Props {
  items: MediaItem[];
  initialIndex: number;
  onClose: () => void;
}

// Helskärmsvisning av ett passets media.
//
// MEDVETET ingen Modal, till skillnad från övningsväljaren. Vyn öppnas
// bland annat inifrån WorkoutDetailModal, och nästlade helskärmsmodaler
// är ostadiga på iOS - samma skäl som gjorde EditWorkoutScreen till en
// egen gren i routern istället för en modal ovanpå profilen. En overlay
// som täcker föräldern fungerar likadant i alla tre skärmarna.
//
// Renderas bara när den är öppen (föräldern villkorar), så att spelaren
// hinner släppas när man stänger istället för att ligga kvar och hålla
// en video i minnet.
export function MediaViewer({ items, initialIndex, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [index, setIndex] = useState(initialIndex);
  const scroll = useRef<ScrollView>(null);
  const positioned = useRef(false);

  const current = items[index];
  // Bara den ruta man faktiskt tittar på får en spelare. En spelare per
  // objekt hade betytt flera avkodare igång samtidigt för att man
  // svepte förbi. useVideoPlayer skapar om spelaren när källan ändras,
  // så det räcker att peka den på den aktuella videon.
  const player = useVideoPlayer(
    current?.mediaType === "video" ? current.uri : null,
    (instance) => {
      instance.loop = false;
      instance.play();
    },
  );

  return (
    <View style={styles.overlay}>
      <ScrollView
        ref={scroll}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        // contentOffset placerar rätt ruta direkt på iOS men ignoreras
        // på Android, så startpositionen sätts även härifrån - en gång,
        // annars hoppar vyn tillbaka vid varje omrendering.
        contentOffset={{ x: initialIndex * width, y: 0 }}
        onContentSizeChange={() => {
          if (positioned.current) return;
          positioned.current = true;
          scroll.current?.scrollTo({ x: initialIndex * width, animated: false });
        }}
        onMomentumScrollEnd={(event) =>
          setIndex(Math.round(event.nativeEvent.contentOffset.x / width))
        }
      >
        {items.map((item, itemIndex) => (
          <View key={item.id} style={[styles.page, { width, height }]}>
            {item.uri === null ? (
              // Signerad URL har inte kommit än.
              <ActivityIndicator color="#fff" />
            ) : item.mediaType === "image" ? (
              <Image
                source={{ uri: item.uri }}
                style={styles.media}
                resizeMode="contain"
              />
            ) : itemIndex === index ? (
              <VideoView
                style={styles.media}
                player={player}
                contentFit="contain"
                nativeControls
              />
            ) : (
              // Grannrutorna finns för svepet, men ska inte spela.
              <Text style={styles.playIcon}>▶</Text>
            )}
          </View>
        ))}
      </ScrollView>

      {items.length > 1 && (
        <Text style={[styles.counter, { top: insets.top + 20 }]}>
          {index + 1} / {items.length}
        </Text>
      )}

      <TouchableOpacity
        style={[styles.closeButton, { top: insets.top + 12 }]}
        onPress={onClose}
        accessibilityLabel="Stäng"
      >
        <Text style={styles.closeText}>Stäng</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "#000",
  },
  page: {
    alignItems: "center",
    justifyContent: "center",
  },
  media: {
    width: "100%",
    height: "100%",
  },
  playIcon: {
    color: "#4b5563",
    fontSize: 48,
  },
  counter: {
    // top overridden inline with insets.top - see render.
    position: "absolute",
    left: 24,
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
  closeButton: {
    // top overridden inline with insets.top - see render.
    position: "absolute",
    right: 16,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  closeText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});
