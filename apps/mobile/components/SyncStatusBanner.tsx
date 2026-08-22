import { StyleSheet, Text } from "react-native";

interface Props {
  online: boolean;
  pendingCount: number;
  // Filer som väntar i uppladdningskön. En egen siffra, inte inräknad i
  // pendingCount: en video kan ligga i minuter medan set-ändringarna
  // gick igenom på en sekund, och "synkar 1 ändring" som står kvar hela
  // tiden ser ut som att något hängt sig.
  pendingMediaCount: number;
  offlineLabel?: string;
}

export function SyncStatusBanner({
  online,
  pendingCount,
  pendingMediaCount,
  offlineLabel,
}: Props) {
  if (!online) {
    return <Text style={styles.text}>{offlineLabel ?? "Offline"}</Text>;
  }
  if (pendingCount === 0 && pendingMediaCount === 0) return null;

  const parts: string[] = [];
  if (pendingCount > 0) {
    parts.push(
      `synkar ${pendingCount} ${pendingCount === 1 ? "ändring" : "ändringar"}`,
    );
  }
  if (pendingMediaCount > 0) {
    parts.push(
      `laddar upp ${pendingMediaCount} ${pendingMediaCount === 1 ? "fil" : "filer"}`,
    );
  }

  // Första bokstaven versal - vilken del som råkar komma först beror på
  // vad som väntar.
  const label = parts.join(" · ");
  return (
    <Text style={styles.text}>
      {label.charAt(0).toUpperCase()}
      {label.slice(1)}…
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
