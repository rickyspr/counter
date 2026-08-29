import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { errorMessage } from "../lib/errors";
import { colors, radii } from "../lib/theme";
import {
  acceptFriendRequest,
  cancelFriendRequest,
  declineFriendRequest,
  listFriends,
  listPendingRequests,
  removeFriend,
  searchProfiles,
  sendFriendRequest,
  type Friend,
  type FriendRequest,
  type ProfileSearchResult,
} from "../lib/follows";

interface Props {
  visible: boolean;
  userId: string;
  onClose: () => void;
  onOpenFriend: (friend: Friend) => void;
}

type Tab = "search" | "requests" | "friends";

// En enda Modal med tre sektioner istället för egna Screen-grenar i
// App.tsx eller flera modaler: SocialScreen är inte redan inbäddad i
// någon annan modal, så en helskärms-Modal ovanpå den är säker - samma
// princip som WorkoutDetailModal/MediaViewer redan lagras ovanpå
// ProfileScreen. Vänhantering är en delvy av EN flik, inte en
// helskärms-underskärm som måste överleva oberoende av förälderns
// mount-status (vilket är vad Screen-grenarna i App.tsx är till för).
export function FriendsModal({ visible, userId, onClose, onOpenFriend }: Props) {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>("requests");

  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ProfileSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [actingOnId, setActingOnId] = useState<string | null>(null);

  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loadingLists, setLoadingLists] = useState(false);

  async function refreshLists() {
    setLoadingLists(true);
    try {
      const [reqs, fr] = await Promise.all([
        listPendingRequests(),
        listFriends(),
      ]);
      setRequests(reqs);
      setFriends(fr);
    } catch (err) {
      Alert.alert("Kunde inte hämta vänner", errorMessage(err));
    }
    setLoadingLists(false);
  }

  useEffect(() => {
    if (!visible) return;
    // Nollställs vid varje öppning, precis som ExercisePicker: en gammal
    // sökning eller flik ska inte hänga kvar från förra gången.
    setTab("requests");
    setQuery("");
    setSearchResults([]);
    void refreshLists();
  }, [visible]);

  // Enkel debounce - sök körs 300ms efter senaste tangenttryckningen,
  // inte per tecken.
  useEffect(() => {
    if (query.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    const timeout = setTimeout(() => {
      searchProfiles(query)
        .then(setSearchResults)
        .catch((err) => Alert.alert("Sökningen misslyckades", errorMessage(err)))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(timeout);
  }, [query]);

  async function handleSend(target: ProfileSearchResult) {
    setActingOnId(target.id);
    try {
      await sendFriendRequest(userId, target.id);
      setSearchResults((prev) =>
        prev.map((r) =>
          r.id === target.id ? { ...r, relationship: "pending_sent" } : r,
        ),
      );
    } catch (err) {
      Alert.alert("Kunde inte skicka förfrågan", errorMessage(err));
    }
    setActingOnId(null);
  }

  async function handleAccept(request: FriendRequest) {
    setActingOnId(request.followId);
    try {
      await acceptFriendRequest(request.followId);
      await refreshLists();
    } catch (err) {
      Alert.alert("Kunde inte acceptera", errorMessage(err));
    }
    setActingOnId(null);
  }

  async function handleDeclineOrCancel(request: FriendRequest) {
    setActingOnId(request.followId);
    try {
      if (request.direction === "incoming") {
        await declineFriendRequest(request.followId);
      } else {
        await cancelFriendRequest(request.followId);
      }
      await refreshLists();
    } catch (err) {
      Alert.alert("Kunde inte uppdatera förfrågan", errorMessage(err));
    }
    setActingOnId(null);
  }

  async function handleRemoveFriend(friend: Friend) {
    setActingOnId(friend.id);
    try {
      await removeFriend(userId, friend.id);
      await refreshLists();
    } catch (err) {
      Alert.alert("Kunde inte ta bort vän", errorMessage(err));
    }
    setActingOnId(null);
  }

  const incomingCount = requests.filter((r) => r.direction === "incoming").length;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.container, { paddingTop: insets.top + 24 }]}>
        <View style={styles.header}>
          <Text style={styles.title}>Vänner</Text>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.closeText}>Stäng</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.tabs}>
          <TabButton
            label="Sök"
            active={tab === "search"}
            onPress={() => setTab("search")}
          />
          <TabButton
            label="Förfrågningar"
            active={tab === "requests"}
            badge={incomingCount}
            onPress={() => setTab("requests")}
          />
          <TabButton
            label="Vänner"
            active={tab === "friends"}
            onPress={() => setTab("friends")}
          />
        </View>

        {tab === "search" && (
          <View style={styles.section}>
            <TextInput
              style={styles.input}
              placeholder="Sök på namn"
              value={query}
              onChangeText={setQuery}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {searching ? (
              <ActivityIndicator style={styles.spinner} />
            ) : query.trim().length >= 2 && searchResults.length === 0 ? (
              <Text style={styles.emptyText}>Ingen hittades.</Text>
            ) : (
              searchResults.map((result) => (
                <View key={result.id} style={styles.row}>
                  <Text style={styles.rowName} numberOfLines={1}>
                    {result.displayName ?? "Namnlös"}
                  </Text>
                  <RelationshipAction
                    relationship={result.relationship}
                    busy={actingOnId === result.id}
                    onSend={() => void handleSend(result)}
                  />
                </View>
              ))
            )}
          </View>
        )}

        {tab === "requests" && (
          <View style={styles.section}>
            {loadingLists ? (
              <ActivityIndicator style={styles.spinner} />
            ) : requests.length === 0 ? (
              <Text style={styles.emptyText}>Inga förfrågningar just nu.</Text>
            ) : (
              requests.map((request) => (
                <View key={request.followId} style={styles.row}>
                  <View style={styles.rowTextGroup}>
                    <Text style={styles.rowName} numberOfLines={1}>
                      {request.displayName ?? "Namnlös"}
                    </Text>
                    <Text style={styles.rowMeta}>
                      {request.direction === "incoming"
                        ? "Vill följa dig"
                        : "Väntar på svar"}
                    </Text>
                  </View>
                  {actingOnId === request.followId ? (
                    <ActivityIndicator />
                  ) : (
                    <View style={styles.rowActions}>
                      {request.direction === "incoming" && (
                        <TouchableOpacity
                          style={styles.primaryButton}
                          onPress={() => void handleAccept(request)}
                        >
                          <Text style={styles.primaryButtonText}>Acceptera</Text>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity
                        style={styles.secondaryButton}
                        onPress={() => void handleDeclineOrCancel(request)}
                      >
                        <Text style={styles.secondaryButtonText}>
                          {request.direction === "incoming" ? "Avvisa" : "Avbryt"}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              ))
            )}
          </View>
        )}

        {tab === "friends" && (
          <View style={styles.section}>
            {loadingLists ? (
              <ActivityIndicator style={styles.spinner} />
            ) : friends.length === 0 ? (
              <Text style={styles.emptyText}>
                Inga vänner än - sök fram någon under Sök.
              </Text>
            ) : (
              friends.map((friend) => (
                <View key={friend.id} style={styles.row}>
                  <TouchableOpacity
                    style={styles.rowTextGroup}
                    onPress={() => {
                      onClose();
                      onOpenFriend(friend);
                    }}
                  >
                    <Text style={styles.rowName} numberOfLines={1}>
                      {friend.displayName ?? "Namnlös"}
                    </Text>
                  </TouchableOpacity>
                  {actingOnId === friend.id ? (
                    <ActivityIndicator />
                  ) : (
                    <TouchableOpacity
                      style={styles.secondaryButton}
                      onPress={() => void handleRemoveFriend(friend)}
                    >
                      <Text style={styles.secondaryButtonText}>Ta bort</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))
            )}
          </View>
        )}
      </View>
    </Modal>
  );
}

function TabButton({
  label,
  active,
  badge,
  onPress,
}: {
  label: string;
  active: boolean;
  badge?: number;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.tabButton} onPress={onPress}>
      <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>
        {label}
        {badge ? ` (${badge})` : ""}
      </Text>
    </TouchableOpacity>
  );
}

function RelationshipAction({
  relationship,
  busy,
  onSend,
}: {
  relationship: ProfileSearchResult["relationship"];
  busy: boolean;
  onSend: () => void;
}) {
  if (busy) return <ActivityIndicator />;
  switch (relationship) {
    case "none":
      return (
        <TouchableOpacity style={styles.primaryButton} onPress={onSend}>
          <Text style={styles.primaryButtonText}>Följ</Text>
        </TouchableOpacity>
      );
    case "pending_sent":
      return <Text style={styles.rowMeta}>Skickad</Text>;
    case "pending_received":
      return <Text style={styles.rowMeta}>Se Förfrågningar</Text>;
    case "friends":
      return <Text style={styles.rowMeta}>Vänner</Text>;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: 24,
    gap: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: -0.4,
    color: colors.ink,
  },
  closeText: {
    color: colors.accentDeep,
    fontWeight: "600",
    fontSize: 16,
  },
  tabs: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  tabButton: {
    paddingVertical: 10,
    marginRight: 20,
  },
  tabLabel: {
    fontSize: 15,
    color: colors.textMuted,
  },
  tabLabelActive: {
    color: colors.accentDeep,
    fontWeight: "700",
  },
  section: {
    gap: 4,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    marginBottom: 8,
  },
  spinner: {
    marginTop: 16,
  },
  emptyText: {
    color: colors.textMuted,
    marginTop: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  rowTextGroup: {
    flexShrink: 1,
    gap: 2,
  },
  rowName: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.ink,
    flexShrink: 1,
  },
  rowMeta: {
    color: colors.textMuted,
    fontSize: 13,
  },
  rowActions: {
    flexDirection: "row",
    gap: 8,
  },
  primaryButton: {
    backgroundColor: colors.accent,
    borderRadius: radii.md,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  primaryButtonText: {
    color: colors.onAccent,
    fontWeight: "700",
  },
  secondaryButton: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  secondaryButtonText: {
    color: colors.inkSecondary,
    fontWeight: "600",
  },
});
