import {
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

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
  return (
    <View style={styles.bar}>
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
    borderTopColor: "#e5e7eb",
    backgroundColor: "#fff",
  },
  tab: {
    flex: 1,
    alignItems: "center",
    paddingTop: 14,
    // Flikraden ligger längst ner i fönstret och skulle annars hamna
    // delvis under home-indikatorn på nyare iPhones. Appen har inget
    // safe-area-bibliotek installerat, så det blir en fast marginal.
    paddingBottom: Platform.OS === "ios" ? 28 : 14,
  },
  label: {
    fontSize: 15,
    color: "#6b7280",
  },
  labelActive: {
    color: "#111827",
    fontWeight: "700",
  },
});
