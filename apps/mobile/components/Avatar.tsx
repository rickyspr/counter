import { initialsFor } from "@repcount/shared";
import { Image, StyleSheet, Text, View } from "react-native";
import { colors } from "../lib/theme";

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
    backgroundColor: colors.neutralFill,
  },
  fallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accentTint,
  },
  initials: {
    color: colors.accentDeep,
    fontWeight: "700",
  },
});
