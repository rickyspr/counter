import {
  BIO_MAX_LENGTH,
  DISPLAY_NAME_MAX_LENGTH,
  EARLIEST_BIRTH_DATE,
  HOME_GYM_MAX_LENGTH,
  MAX_BODY_WEIGHT_KG,
  MAX_HEIGHT_CM,
  MIN_HEIGHT_CM,
  calculateAge,
  parseDateOnly,
  toDateOnlyString,
} from "@counter/shared";
import type { Session } from "@supabase/supabase-js";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Avatar } from "../components/Avatar";
import { DateTimeField } from "../components/DateTimeField";
import { deleteAvatarObject, uploadAvatar } from "../lib/avatar";
import { errorMessage } from "../lib/errors";
import { pickProfileImage, type PickedProfileImage } from "../lib/media-picker";
import { signAvatarUrl } from "../lib/media-urls";
import { getOnlineStatus } from "../lib/network";
import { colors, radii, shadows } from "../lib/theme";
import {
  fallbackDisplayName,
  fetchProfile,
  updateProfile,
  type UserProfile,
} from "../lib/profile";
// parseAmount lives in set-parsing.ts but is not a set function: it is
// "Swedish decimal string to number", and the comma is the whole point.
// The same user who types 82,5 into a set types it here.
import { parseAmount } from "../lib/set-parsing";

interface Props {
  session: Session;
  onClose: () => void;
}

// The picture is one of three things, and they are not interchangeable:
// what the server already has, one the user just picked, or nothing at
// all because they cleared it. Only "new" carries bytes to upload, and
// only "clear" means the row should be written with null.
type AvatarAction =
  | { kind: "keep" }
  | { kind: "new"; picked: PickedProfileImage }
  | { kind: "clear" };

// Which fields failed validation on the last attempt to save. Shown
// under the field rather than as an alert: three bad numbers would be
// three dialogs in a row, and the user cannot see the field while one
// is up.
interface FieldErrors {
  birthDate?: string;
  bodyWeight?: string;
  height?: string;
}

// The drafts are strings and the stored values are numbers, so the
// dirty check compares strings in both directions. These two functions
// are what make that comparison honest: the initial draft for 82.5 kg
// has to be exactly what the user would have typed.
function weightDraftFor(value: number | null): string {
  if (value === null) return "";
  return String(value).replace(".", ",");
}

function numberDraftFor(value: number | null): string {
  return value === null ? "" : String(value);
}

// A starting point for the picker when no birth date has been set. It
// is never written unless the user presses Spara, and scrolling from
// 30 years ago is a shorter trip than scrolling from today.
function defaultBirthDate(): Date {
  const now = new Date();
  return new Date(now.getFullYear() - 30, now.getMonth(), now.getDate(), 12);
}

export function ProfileSettingsScreen({ session, onClose }: Props) {
  const userId = session.user.id;
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [nameDraft, setNameDraft] = useState("");
  const [gymDraft, setGymDraft] = useState("");
  const [birthDate, setBirthDate] = useState<Date | null>(null);
  const [weightDraft, setWeightDraft] = useState("");
  const [heightDraft, setHeightDraft] = useState("");
  const [bioDraft, setBioDraft] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});

  const [avatarAction, setAvatarAction] = useState<AvatarAction>({
    kind: "keep",
  });
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  // What the server had when the screen opened. Used for the dirty
  // check and to know which object to delete once a new one is in
  // place.
  const initial = useRef<UserProfile | null>(null);

  // Once per mount. A fresh Date on every render would hand the picker
  // a new object each time for a bound that never actually moves.
  const today = useRef(new Date()).current;

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      // Read once, not through useSyncStatus: with the connection in a
      // dependency list a flickering network would reload the screen
      // mid-edit and throw away everything typed. Same reasoning as
      // EditWorkoutScreen.
      if (!getOnlineStatus()) {
        throw new Error(
          "Det går inte att redigera profilen utan uppkoppling. Försök igen när du är online.",
        );
      }

      const profile = await fetchProfile(userId);
      initial.current = profile;
      setNameDraft(profile.displayName ?? "");
      setGymDraft(profile.homeGym ?? "");
      setBirthDate(profile.birthDate ? parseDateOnly(profile.birthDate) : null);
      setWeightDraft(weightDraftFor(profile.bodyWeightKg));
      setHeightDraft(numberDraftFor(profile.heightCm));
      setBioDraft(profile.bio ?? "");
      setAvatarAction({ kind: "keep" });

      // Signed separately and allowed to fail on its own: a picture
      // that will not load must not empty the form around it.
      setAvatarUrl(
        profile.avatarPath ? await signAvatarUrl(profile.avatarPath) : null,
      );
    } catch (err) {
      setLoadError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  function isDirty(): boolean {
    if (avatarAction.kind !== "keep") return true;
    const before = initial.current;
    if (!before) return false;
    return (
      nameDraft.trim() !== (before.displayName ?? "") ||
      gymDraft.trim() !== (before.homeGym ?? "") ||
      (birthDate === null ? "" : toDateOnlyString(birthDate)) !==
        (before.birthDate ?? "") ||
      weightDraft.trim() !== weightDraftFor(before.bodyWeightKg) ||
      heightDraft.trim() !== numberDraftFor(before.heightCm) ||
      bioDraft.trim() !== (before.bio ?? "")
    );
  }

  // An error belongs to the value that produced it. Editing the field
  // makes it stale, so it goes away then rather than surviving until
  // the next press on Spara.
  function clearError(field: keyof FieldErrors) {
    setErrors((prev) => {
      if (prev[field] === undefined) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }

  // Empty means null everywhere, never the empty string - the same rule
  // the display name has followed since the profile card existed. A
  // cleared home gym is an absent home gym, not a blank one.
  function textOrNull(value: string): string | null {
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
  }

  // Returns the values to write, or null after having filled in
  // `errors`. Nothing is uploaded or written until every field passes:
  // a half-saved profile is worse than a rejected save.
  function validate(): {
    displayName: string | null;
    homeGym: string | null;
    birthDate: string | null;
    bodyWeightKg: number | null;
    heightCm: number | null;
    bio: string | null;
  } | null {
    const next: FieldErrors = {};

    let birthDateValue: string | null = null;
    if (birthDate !== null) {
      const value = toDateOnlyString(birthDate);
      // ISO dates compare correctly as strings - fixed width, most
      // significant part first - so this is the same test as the
      // profiles_birth_date_range constraint without parsing anything.
      if (value < EARLIEST_BIRTH_DATE) {
        next.birthDate = "Ange ett datum efter 1900.";
      } else if (calculateAge(value) === null) {
        next.birthDate = "Födelsedatumet kan inte ligga i framtiden.";
      } else {
        birthDateValue = value;
      }
    }

    let bodyWeightKg: number | null = null;
    const weight = weightDraft.trim();
    if (weight !== "") {
      const parsed = parseAmount(weight);
      if (parsed === null || parsed <= 0 || parsed >= MAX_BODY_WEIGHT_KG) {
        next.bodyWeight = `Ange en vikt mellan 0 och ${MAX_BODY_WEIGHT_KG} kg.`;
      } else {
        // One decimal is what a bathroom scale shows. Rounding here
        // rather than in the column keeps 82,55 from becoming a number
        // the user never entered and cannot see.
        bodyWeightKg = Math.round(parsed * 10) / 10;
      }
    }

    let heightCm: number | null = null;
    const height = heightDraft.trim();
    if (height !== "") {
      const parsed = parseAmount(height);
      if (
        parsed === null ||
        !Number.isInteger(parsed) ||
        parsed < MIN_HEIGHT_CM ||
        parsed > MAX_HEIGHT_CM
      ) {
        next.height = `Ange en längd i hela cm, mellan ${MIN_HEIGHT_CM} och ${MAX_HEIGHT_CM}.`;
      } else {
        heightCm = parsed;
      }
    }

    setErrors(next);
    if (Object.keys(next).length > 0) return null;

    return {
      displayName: textOrNull(nameDraft),
      homeGym: textOrNull(gymDraft),
      birthDate: birthDateValue,
      bodyWeightKg,
      heightCm,
      bio: textOrNull(bioDraft),
    };
  }

  async function handlePickImage() {
    const picked = await pickProfileImage();
    if (!picked) return;
    // Only a preview until Spara. Uploading on pick would leave a file
    // in the bucket for every picture the user tried and rejected, and
    // it would make "Avbryt" a lie.
    setAvatarAction({ kind: "new", picked });
  }

  function handleClearImage() {
    setAvatarAction({ kind: "clear" });
  }

  async function handleSave() {
    const values = validate();
    if (values === null) return;

    if (!getOnlineStatus()) {
      Alert.alert(
        "Ingen uppkoppling",
        "Profilen sparas inte lokalt. Försök igen när du är online.",
      );
      return;
    }

    setSaving(true);
    // Remembered outside the try so the catch can clean up after
    // itself: an upload that succeeded before the row write failed is
    // a file nothing points at.
    let uploadedPath: string | null = null;
    const previousPath = initial.current?.avatarPath ?? null;

    try {
      let avatarPath = previousPath;
      if (avatarAction.kind === "new") {
        uploadedPath = await uploadAvatar(userId, avatarAction.picked);
        avatarPath = uploadedPath;
      } else if (avatarAction.kind === "clear") {
        avatarPath = null;
      }

      await updateProfile(userId, { ...values, avatarPath });

      // Only now, with the row pointing somewhere else, is the old file
      // safe to remove. The other order risks a profile pointing at an
      // object that is already gone.
      if (previousPath && previousPath !== avatarPath) {
        void deleteAvatarObject(previousPath);
      }
      onClose();
    } catch (err) {
      if (uploadedPath) void deleteAvatarObject(uploadedPath);
      Alert.alert("Kunde inte spara profilen", errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    if (!isDirty()) {
      onClose();
      return;
    }
    Alert.alert("Kassera ändringarna?", "Det du har ändrat sparas inte.", [
      { text: "Fortsätt redigera", style: "cancel" },
      { text: "Kassera", style: "destructive", onPress: onClose },
    ]);
  }

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator />
      </View>
    );
  }

  if (loadError !== null) {
    return (
      <View style={[styles.container, styles.center, { paddingTop: insets.top + 24 }]}>
        <Text style={styles.errorText}>{loadError}</Text>
        <TouchableOpacity style={styles.secondaryButton} onPress={() => void load()}>
          <Text style={styles.secondaryButtonText}>Försök igen</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onClose}>
          <Text style={styles.linkText}>Tillbaka</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const fallbackName = fallbackDisplayName(session);
  const previewUri =
    avatarAction.kind === "new"
      ? avatarAction.picked.localUri
      : avatarAction.kind === "clear"
        ? null
        : avatarUrl;
  const age = birthDate === null ? null : calculateAge(toDateOnlyString(birthDate));

  return (
    <KeyboardAvoidingView
      style={[
        styles.container,
        { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 },
      ]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        // Without this the first tap on a button goes to dismissing the
        // keyboard instead of hitting the button.
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>Redigera profil</Text>

        <View style={[styles.card, styles.avatarCard]}>
          <Avatar uri={previewUri} name={fallbackName} size={96} />
          <View style={styles.avatarButtons}>
            <TouchableOpacity onPress={() => void handlePickImage()}>
              <Text style={styles.linkAction}>
                {previewUri ? "Byt bild" : "Lägg till bild"}
              </Text>
            </TouchableOpacity>
            {previewUri && (
              <TouchableOpacity onPress={handleClearImage}>
                <Text style={styles.linkDanger}>Ta bort bild</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Om dig</Text>

          <Text style={styles.label}>Visningsnamn</Text>
          <TextInput
            style={styles.input}
            value={nameDraft}
            onChangeText={setNameDraft}
            placeholder={fallbackName}
            placeholderTextColor={colors.textFaint}
            maxLength={DISPLAY_NAME_MAX_LENGTH}
            autoCapitalize="words"
            returnKeyType="done"
          />

          <Text style={styles.label}>Hemgym</Text>
          <TextInput
            style={styles.input}
            value={gymDraft}
            onChangeText={setGymDraft}
            placeholder="T.ex. SATS Solna"
            placeholderTextColor={colors.textFaint}
            maxLength={HOME_GYM_MAX_LENGTH}
            autoCapitalize="words"
            returnKeyType="done"
          />

          <Text style={styles.label}>Födelsedatum</Text>
          {birthDate === null ? (
            <TouchableOpacity onPress={() => setBirthDate(defaultBirthDate())}>
              <Text style={styles.linkAction}>Ange födelsedatum</Text>
            </TouchableOpacity>
          ) : (
            <>
              <DateTimeField
                label={age === null ? "Datum" : `${age} år`}
                value={birthDate}
                onChange={(next) => {
                  clearError("birthDate");
                  setBirthDate(next);
                }}
                mode="date"
                minimumDate={parseDateOnly(EARLIEST_BIRTH_DATE) ?? undefined}
                maximumDate={today}
              />
              <TouchableOpacity onPress={() => setBirthDate(null)}>
                <Text style={styles.linkText}>Ta bort födelsedatum</Text>
              </TouchableOpacity>
            </>
          )}
          {errors.birthDate && (
            <Text style={styles.fieldError}>{errors.birthDate}</Text>
          )}

          <Text style={styles.label}>Vikt (kg)</Text>
          <TextInput
            style={styles.input}
            value={weightDraft}
            onChangeText={(text) => {
              clearError("bodyWeight");
              setWeightDraft(text);
            }}
            placeholder="82,5"
            placeholderTextColor={colors.textFaint}
            keyboardType="decimal-pad"
            returnKeyType="done"
          />
          {errors.bodyWeight && (
            <Text style={styles.fieldError}>{errors.bodyWeight}</Text>
          )}

          <Text style={styles.label}>Längd (cm)</Text>
          <TextInput
            style={styles.input}
            value={heightDraft}
            onChangeText={(text) => {
              clearError("height");
              setHeightDraft(text);
            }}
            placeholder="180"
            placeholderTextColor={colors.textFaint}
            keyboardType="number-pad"
            returnKeyType="done"
          />
          {errors.height && <Text style={styles.fieldError}>{errors.height}</Text>}

          <Text style={styles.label}>Om mig</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            value={bioDraft}
            onChangeText={setBioDraft}
            placeholder="Vad tränar du för?"
            placeholderTextColor={colors.textFaint}
            maxLength={BIO_MAX_LENGTH}
            multiline
            textAlignVertical="top"
          />
          <Text style={styles.hintText}>
            {bioDraft.length}/{BIO_MAX_LENGTH}
          </Text>

          <Text style={styles.hintText}>
            Tomma fält visas inte på profilen.
          </Text>
        </View>
      </ScrollView>

      <TouchableOpacity
        style={[styles.doneButton, saving && styles.doneButtonDisabled]}
        onPress={() => void handleSave()}
        disabled={saving}
      >
        {saving ? (
          <ActivityIndicator color={colors.onAccent} />
        ) : (
          <Text style={styles.doneButtonText}>Spara</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity onPress={handleCancel} disabled={saving}>
        <Text style={styles.linkText}>Avbryt</Text>
      </TouchableOpacity>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: 24,
    gap: 16,
  },
  center: {
    alignItems: "center",
    justifyContent: "center",
  },
  scroll: {
    gap: 16,
    paddingBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: -0.4,
    color: colors.ink,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    padding: 18,
    gap: 8,
    ...shadows.card,
  },
  avatarCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  avatarButtons: {
    gap: 8,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.ink,
  },
  label: {
    color: colors.inkSecondary,
    fontSize: 14,
    marginTop: 4,
  },
  input: {
    backgroundColor: colors.surfaceSunken,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  multiline: {
    minHeight: 88,
  },
  hintText: {
    color: colors.textMuted,
    fontSize: 13,
  },
  fieldError: {
    color: colors.danger,
    fontSize: 13,
  },
  errorText: {
    color: colors.danger,
    textAlign: "center",
  },
  linkAction: {
    color: colors.accentDeep,
    fontWeight: "600",
  },
  linkDanger: {
    color: colors.danger,
  },
  linkText: {
    color: colors.textMuted,
    textAlign: "center",
  },
  secondaryButton: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: "center",
    ...shadows.card,
  },
  secondaryButtonText: {
    color: colors.inkSecondary,
    fontWeight: "600",
  },
  doneButton: {
    backgroundColor: colors.accent,
    borderRadius: radii.lg,
    paddingVertical: 16,
    alignItems: "center",
    ...shadows.accentButton,
  },
  doneButtonDisabled: {
    opacity: 0.6,
  },
  doneButtonText: {
    color: colors.onAccent,
    fontSize: 16,
    fontWeight: "700",
  },
});
