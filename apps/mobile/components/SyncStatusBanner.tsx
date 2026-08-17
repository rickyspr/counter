import { StyleSheet, Text } from "react-native";

interface Props {
  online: boolean;
  pendingCount: number;
  offlineLabel?: string;
}

export function SyncStatusBanner({ online, pendingCount, offlineLabel }: Props) {
  if (online && pendingCount === 0) return null;

  return (
    <Text style={styles.text}>
      {!online
        ? (offlineLabel ?? "Offline")
        : `Synkar ${pendingCount} ${pendingCount === 1 ? "ändring" : "ändringar"}…`}
    </Text>
  );
}

const styles = StyleSheet.create({
  text: {
    textAlign: "center",
    color: "#6b7280",
    fontSize: 13,
  },
});
