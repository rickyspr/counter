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
  // "date" drops the time half entirely. A birth date is a calendar
  // day; showing 00:00 next to it would invite editing something that
  // is never stored (profiles.birth_date is a `date`).
  mode?: "datetime" | "date";
  // Passed straight through to the picker. Cheaper than validation for
  // the user: a date they cannot scroll to is a date they cannot be
  // told off for having chosen.
  minimumDate?: Date;
  maximumDate?: Date;
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
export function DateTimeField({
  label,
  value,
  onChange,
  mode = "datetime",
  minimumDate,
  maximumDate,
}: Props) {
  if (Platform.OS === "android") {
    const open = (pickerMode: "date" | "time") => {
      DateTimePickerAndroid.open({
        value,
        mode: pickerMode,
        is24Hour: true,
        minimumDate,
        maximumDate,
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
          {mode === "datetime" && (
            <TouchableOpacity style={styles.chip} onPress={() => open("time")}>
              <Text style={styles.chipText}>{formatTime(value)}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <DateTimePicker
        value={value}
        mode={mode}
        display="compact"
        locale="sv-SE"
        minimumDate={minimumDate}
        maximumDate={maximumDate}
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
