import DateTimePicker, {
  DateTimePickerAndroid,
} from "@react-native-community/datetimepicker";
import {
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

interface Props {
  label: string;
  value: Date;
  onChange: (next: Date) => void;
}

function formatDate(value: Date): string {
  return value.toLocaleDateString("sv-SE", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatTime(value: Date): string {
  return value.toLocaleTimeString("sv-SE", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

// De två plattformarna får varsin utformning med flit - biblioteket är
// inte ett UI, det är två.
//
// iOS renderar väljaren INLINE i vy-trädet, så "compact" ger ett litet
// tryckbart fält som öppnar en overlay. Android har ingen inline-variant
// alls utan öppnas imperativt som en dialog (DateTimePickerAndroid),
// ungefär som Alert.
//
// Android får dessutom datum och tid som två separata fält. Att kedja
// dialogerna - öppna tidsväljaren inifrån datumväljarens callback -
// innebär att en dialog öppnas medan den förra fortfarande stängs, och
// det är ostadigt. Två tryck är tråkigare än ett, men fungerar alltid.
export function DateTimeField({ label, value, onChange }: Props) {
  if (Platform.OS === "android") {
    const open = (mode: "date" | "time") => {
      DateTimePickerAndroid.open({
        value,
        mode,
        is24Hour: true,
        // Väljaren returnerar en Date som behåller de delar man inte
        // valde: datumdialogen tar med befintlig tid, tidsdialogen tar
        // med befintligt datum. Alltså går de att sätta var för sig.
        onValueChange: (_event, picked) => onChange(picked),
      });
    };

    return (
      <View style={styles.row}>
        <Text style={styles.label}>{label}</Text>
        <View style={styles.androidFields}>
          <TouchableOpacity style={styles.chip} onPress={() => open("date")}>
            <Text style={styles.chipText}>{formatDate(value)}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.chip} onPress={() => open("time")}>
            <Text style={styles.chipText}>{formatTime(value)}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <DateTimePicker
        value={value}
        mode="datetime"
        display="compact"
        locale="sv-SE"
        onValueChange={(_event, picked) => onChange(picked)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  label: {
    color: "#374151",
    fontSize: 16,
  },
  androidFields: {
    flexDirection: "row",
    gap: 8,
  },
  chip: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipText: {
    fontSize: 16,
  },
});
