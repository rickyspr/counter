import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import type { FeedWorkoutEntry } from "../lib/feed";
import type { MediaItem } from "../lib/media-item";
import { colors, radii, shadows } from "../lib/theme";
import { Avatar } from "./Avatar";
import { WorkoutMediaCarousel } from "./WorkoutMediaCarousel";

// Delad av SocialScreen (flödet, flera författare) och FriendProfileScreen
// (en väns historik, samma datalager - fetchFeed() med en ensam vän i
// listan) - båda renderar exakt samma kort.
export const CARD_BORDER = 1;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("sv-SE", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function FeedRow({
  item,
  mediaItems,
  avatarUrl,
  cardWidth,
  onPress,
  onOpenMedia,
  onToggleKudos,
  onOpenAuthor,
}: {
  item: FeedWorkoutEntry;
  mediaItems: MediaItem[];
  avatarUrl: string | null;
  cardWidth: number;
  onPress: () => void;
  onOpenMedia: (index: number) => void;
  onToggleKudos: () => void;
  // Saknas på FriendProfileScreen: man är redan på personens profil, så
  // författarraden där är inte en tryckyta utan bara en visning.
  onOpenAuthor?: () => void;
}) {
  const authorName = item.authorDisplayName ?? "Okänd";
  return (
    <View style={styles.workoutCard}>
      <TouchableOpacity
        style={styles.authorRow}
        onPress={onOpenAuthor}
        disabled={!onOpenAuthor}
        activeOpacity={onOpenAuthor ? 0.6 : 1}
      >
        <Avatar uri={avatarUrl} name={authorName} size={32} />
        <Text style={styles.authorName} numberOfLines={1}>
          {authorName}
        </Text>
      </TouchableOpacity>

      <WorkoutMediaCarousel items={mediaItems} width={cardWidth} onOpen={onOpenMedia} />

      <TouchableOpacity style={styles.workoutRow} onPress={onPress}>
        <View style={styles.workoutRowTop}>
          <Text style={styles.workoutDate} numberOfLines={1}>
            {item.name ?? formatDate(item.startedAt)}
          </Text>
          <Text style={styles.workoutVolume}>
            {item.summary.totalVolumeKg.toLocaleString("sv-SE")} kg
          </Text>
        </View>
        {item.name !== null && (
          <Text style={styles.workoutMeta}>{formatDate(item.startedAt)}</Text>
        )}
        {item.exercises.length > 0 && (
          <Text style={styles.workoutExercises} numberOfLines={1}>
            {[...new Set(item.exercises.map((e) => e.name))].join(", ")}
          </Text>
        )}
        <Text style={styles.workoutMeta}>
          {item.summary.setCount} set · {item.summary.exerciseCount}{" "}
          {item.summary.exerciseCount === 1 ? "övning" : "övningar"}
          {item.summary.durationMinutes !== null
            ? ` · ${item.summary.durationMinutes} min`
            : ""}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.kudosRow}
        onPress={onToggleKudos}
        accessibilityRole="button"
        accessibilityState={{ selected: item.kudosGivenByMe }}
      >
        <Text
          style={[
            styles.kudosText,
            item.kudosGivenByMe && styles.kudosTextActive,
          ]}
        >
          {item.kudosGivenByMe ? "★ Peppad" : "☆ Peppa"}
          {item.kudosCount > 0 ? ` (${item.kudosCount})` : ""}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  workoutCard: {
    backgroundColor: colors.surface,
    borderWidth: CARD_BORDER,
    borderColor: colors.border,
    borderRadius: radii.lg,
    overflow: "hidden",
    ...shadows.card,
  },
  authorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    paddingBottom: 8,
  },
  authorName: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.ink,
    flexShrink: 1,
  },
  workoutRow: {
    padding: 16,
    paddingTop: 12,
    gap: 4,
  },
  workoutRowTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  workoutDate: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.ink,
  },
  workoutVolume: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.ink,
  },
  workoutExercises: {
    color: colors.inkSecondary,
  },
  workoutMeta: {
    color: colors.textMuted,
    fontSize: 13,
  },
  kudosRow: {
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  kudosText: {
    color: colors.inkSecondary,
    fontWeight: "600",
  },
  kudosTextActive: {
    color: colors.kudos,
  },
});
