import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../lib/theme";

export type TabName = "home" | "social" | "profile";

interface Props {
  active: TabName;
  onSelect: (tab: TabName) => void;
}

const TABS: { name: TabName; label: string }[] = [
  { name: "home", label: "Hem" },
  { name: "social", label: "Socialt" },
  { name: "profile", label: "Profil" },
];

// Handrullad, i samma anda som routern i App.tsx - appen har inget
// navigationsbibliotek. Inga ikoner heller: det finns inget ikonpaket
// installerat, och stilen i övriga skärmar är ren text.
export function TabBar({ active, onSelect }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingBottom: insets.bottom + 14 }]}>
      {TABS.map((tab) => {
        const isActive = tab.name === active;
        return (
          <TouchableOpacity
            key={tab.name}
            style={styles.tab}
            accessibilityRole="button"
            accessibilityState={{ selected: isActive }}
            onPress={() => onSelect(tab.name)}
          >
            <Text style={[styles.label, isActive && styles.labelActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    backgroundColor: colors.surface,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    paddingTop: 14,
  },
  label: {
    fontSize: 15,
    color: colors.textMuted,
  },
  labelActive: {
    color: colors.accentDeep,
    fontWeight: "700",
  },
});
