import { Image, StyleSheet, Text, View } from "react-native";

interface Props {
  // A signed URL for the stored avatar, or a local file:// URI for one
  // that has been picked but not saved yet. Null falls back to initials.
  uri: string | null;
  // Whatever the profile screen would print as the user's name - the
  // display name, the Google name, or the email address. Only used to
  // derive the initials.
  name: string;
  size: number;
}

// At most two letters, from the first and last word. An email address
// has no words to speak of, so everything before the @ counts as one -
// "rickard.hjerpe@..." gives "R" rather than "R@".
function initialsFor(name: string): string {
  const cleaned = name.split("@")[0]!.replace(/[._-]+/g, " ").trim();
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = words[0]![0]!;
  const last = words.length > 1 ? words[words.length - 1]![0]! : "";
  return (first + last).toUpperCase();
}

export function Avatar({ uri, name, size }: Props) {
  const circle = {
    width: size,
    height: size,
    borderRadius: size / 2,
  };

  if (uri) {
    return <Image source={{ uri }} style={[styles.image, circle]} />;
  }

  return (
    <View style={[styles.fallback, circle]}>
      <Text style={[styles.initials, { fontSize: size * 0.38 }]}>
        {initialsFor(name)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  image: {
    backgroundColor: "#e5e7eb",
  },
  fallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#e5e7eb",
  },
  initials: {
    color: "#4b5563",
    fontWeight: "700",
  },
});
