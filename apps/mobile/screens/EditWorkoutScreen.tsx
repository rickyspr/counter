import { WORKOUT_NAME_MAX_LENGTH } from "@counter/shared";
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
import { DateTimeField } from "../components/DateTimeField";
import { ExercisePicker } from "../components/ExercisePicker";
import { ExerciseSection } from "../components/ExerciseSection";
import { MediaStrip } from "../components/MediaStrip";
import { MediaViewer } from "../components/MediaViewer";
import { SyncStatusBanner } from "../components/SyncStatusBanner";
import type { MediaItem } from "../lib/media-item";
import { pickWorkoutMedia } from "../lib/media-picker";
import {
  isMediaQueueDrained,
  subscribeToPendingMediaIds,
} from "../lib/media-queue";
import { signMediaUrls } from "../lib/media-urls";
import { getOnlineStatus } from "../lib/network";
import { drainQueue } from "../lib/offline-queue";
import { colors, radii, shadows } from "../lib/theme";
import {
  addExerciseToWorkout,
  addWorkoutMedia,
  createCustomExercise,
  deleteSet,
  deleteWorkout,
  fetchExerciseCatalog,
  fetchWorkoutForEdit,
  newSetId,
  removeAllWorkoutMedia,
  removeExerciseFromWorkout,
  removeWorkoutMedia,
  saveSet,
  updateWorkoutDetails,
  type ExerciseOption,
  type PreviousSet,
  type WorkoutMediaRow,
} from "../lib/queries";
import {
  isUnchanged,
  parseSetDrafts,
  type LoggedSet,
} from "../lib/set-parsing";
import { useSyncStatus } from "../lib/use-sync-status";

interface Props {
  userId: string;
  workoutId: string;
  onClose: () => void;
}

interface Section {
  workoutExerciseId: string;
  exerciseId: string;
  exerciseName: string;
  sets: LoggedSet[];
}

function formatDate(value: Date): string {
  return value.toLocaleDateString("sv-SE", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// Skuggvärden från "förra passet" hör inte hemma här: passet man
// redigerar ÄR historik, och att jämföra det med ett senare pass vore
// bakvänt. Modulnivå så att det inte blir en ny array per rendering.
const NO_PREVIOUS_SETS: PreviousSet[] = [];

// Vad servern hade när passet lästes in. Används bara för att avgöra om
// namn/tider faktiskt ändrats, så ett tryck på "Klar" utan ändringar
// inte köar en uppdatering.
interface ServerMeta {
  name: string | null;
  startedAt: string;
  endedAt: string;
}

// Media på den här skärmen är av två slag samtidigt: det som redan
// ligger på servern, och det man just lagt till och som fortfarande
// laddas upp. `localUri` är skillnaden - den är satt bara för det
// nytillagda, och är då det enda som går att visa (någon signerad URL
// finns inte förrän filen kommit fram).
interface EditMedia extends WorkoutMediaRow {
  localUri: string | null;
}

export function EditWorkoutScreen({ userId, workoutId, onClose }: Props) {
  const { online, pendingCount, pendingMediaCount } = useSyncStatus();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<ExerciseOption[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);

  const [sections, setSections] = useState<Section[]>([]);
  const [nameDraft, setNameDraft] = useState("");
  const [startedAt, setStartedAt] = useState<Date | null>(null);
  const [endedAt, setEndedAt] = useState<Date | null>(null);

  const [pendingFocusId, setPendingFocusId] = useState<string | null>(null);
  const [flaggedSetIds, setFlaggedSetIds] = useState<string[]>([]);

  const [media, setMedia] = useState<EditMedia[]>([]);
  const [mediaUrls, setMediaUrls] = useState<Map<string, string>>(new Map());
  const [pendingMediaIds, setPendingMediaIds] = useState<string[]>([]);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  useEffect(() => subscribeToPendingMediaIds(setPendingMediaIds), []);

  // Nästa lediga order_index för passet, och nästa lediga set_nr per
  // övning - båda uträknade som max+1 av fetchWorkoutForEdit.
  //
  // Till skillnad från ActiveWorkoutScreen skrivs de ALDRIG till disk.
  // Där behövs det för att räknarna inte går att räkna fram igen; här
  // görs de om från servern vid varje öppning, efter att kön tömts. Dör
  // appen mitt i en redigering ligger de köade raderna kvar på disk med
  // sina nummer, spelas upp mot servern, och nästa öppning läser ett max
  // som redan är förbi dem.
  const nextOrderIndex = useRef(0);
  const nextSetNr = useRef<Record<string, number>>({});
  const firstInputs = useRef<Record<string, TextInput | null>>({});
  const savedMeta = useRef<ServerMeta | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      // Läses som en ögonblicksbild, inte via useSyncStatus: hade
      // uppkopplingen legat i beroendelistan hade en vippande anslutning
      // laddat om skärmen mitt i en redigering och slängt allt ofyllt.
      if (!getOnlineStatus()) {
        throw new Error(
          "Det går inte att redigera ett pass utan uppkoppling. Försök igen när du är online.",
        );
      }
      // Måste ske FÖRE hämtningen. Se drainQueue i offline-queue.ts:
      // räknarna nedan är max+1 över det servern svarar med, och det
      // stämmer bara när allt som finns har hunnit dit.
      if (!(await drainQueue())) {
        throw new Error(
          "Det finns ändringar som inte hunnit synkas. Försök igen om en stund.",
        );
      }
      // Samma krav, andra kön. Media som ännu inte laddats upp finns
      // inte i svaret från servern - remsan hade sett ut som om bilden
      // aldrig lagts till, och en radering här hade tagit bort fel sak.
      if (!(await isMediaQueueDrained())) {
        throw new Error(
          "Det finns bilder eller videor som inte hunnit laddas upp. Försök igen om en stund.",
        );
      }

      const workout = await fetchWorkoutForEdit(userId, workoutId);
      nextOrderIndex.current = workout.nextOrderIndex;
      nextSetNr.current = { ...workout.nextSetNr };
      savedMeta.current = {
        name: workout.name,
        startedAt: workout.startedAt,
        endedAt: workout.endedAt,
      };
      setNameDraft(workout.name ?? "");
      setStartedAt(new Date(workout.startedAt));
      setEndedAt(new Date(workout.endedAt));
      setMedia(workout.media.map((item) => ({ ...item, localUri: null })));
      setViewerIndex(null);
      // Bucketen är privat, så rutorna är tomma tills URL:erna kommit.
      // Ett fel här stoppar INTE inläsningen av passet: går bilderna
      // inte att visa ska set och tider ändå gå att rätta.
      signMediaUrls(workout.media.map((item) => item.storagePath))
        .then(setMediaUrls)
        .catch(() => {});
      setSections(
        workout.exercises.map((exercise) => ({
          workoutExerciseId: exercise.workoutExerciseId,
          exerciseId: exercise.exerciseId,
          exerciseName: exercise.exerciseName,
          // Raderna kommer från databasen, alltså är de per definition
          // redan sparade: `saved` fylls i, och utkasten speglar den.
          sets: exercise.sets.map((set) => ({
            id: set.id,
            setNr: set.setNr,
            repsDraft: String(set.reps),
            weightDraft: String(set.weightKg),
            saved: { reps: set.reps, weightKg: set.weightKg },
          })),
        })),
      );
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Okänt fel.");
    } finally {
      setLoading(false);
    }
  }, [userId, workoutId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    fetchExerciseCatalog()
      .then(setCatalog)
      .catch(() => {
        // Katalogen ligger cachad sedan tidigare i normalfallet, och
        // skärmen kräver ändå nät - misslyckas den syns det som en tom
        // väljare, inte som en dialog ovanpå en dialog.
      });
  }, []);

  // Samma mönster som i det pågående passet: skrivningarna går via
  // synk-kön och väntar bara in det lokala sparandet.
  async function handlePickExercise(exercise: ExerciseOption) {
    setPickerOpen(false);
    const orderIndex = nextOrderIndex.current;
    nextOrderIndex.current += 1;
    try {
      const workoutExercise = await addExerciseToWorkout(
        workoutId,
        exercise.id,
        orderIndex,
      );
      // En övning utan set finns inte i den här appen, så rad 1 följer
      // med direkt. Den är tom - alltså saved: null, alltså aldrig köad
      // förrän båda fälten går att tolka.
      const firstSet: LoggedSet = {
        id: newSetId(),
        setNr: 1,
        repsDraft: "",
        weightDraft: "",
        saved: null,
      };
      nextSetNr.current[workoutExercise.id] = firstSet.setNr + 1;
      setSections((prev) => [
        ...prev,
        {
          workoutExerciseId: workoutExercise.id,
          exerciseId: exercise.id,
          exerciseName: exercise.name,
          sets: [firstSet],
        },
      ]);
    } catch (err) {
      Alert.alert(
        "Kunde inte lägga till övning",
        err instanceof Error ? err.message : "Okänt fel.",
      );
    }
  }

  function handleCreateSetRow(section: Section) {
    const setNr = nextSetNr.current[section.workoutExerciseId] ?? 1;
    nextSetNr.current[section.workoutExerciseId] = setNr + 1;
    const id = newSetId();

    setSections((prev) =>
      prev.map((s) =>
        s.workoutExerciseId === section.workoutExerciseId
          ? {
              ...s,
              sets: [
                ...s.sets,
                { id, setNr, repsDraft: "", weightDraft: "", saved: null },
              ],
            }
          : s,
      ),
    );
    setPendingFocusId(id);
  }

  function updateSetDraft(
    workoutExerciseId: string,
    setId: string,
    field: "repsDraft" | "weightDraft",
    value: string,
  ) {
    setSections((prev) =>
      prev.map((section) =>
        section.workoutExerciseId === workoutExerciseId
          ? {
              ...section,
              sets: section.sets.map((s) =>
                s.id === setId ? { ...s, [field]: value } : s,
              ),
            }
          : section,
      ),
    );
  }

  // Ett halvifyllt fält gör ingenting alls vid blur - man ska kunna
  // hoppa mellan kg och reps utan att bli avbruten. Det som saknas
  // fångas av valideringen i handleDone.
  async function commitSetEdit(section: Section, set: LoggedSet) {
    const parsed = parseSetDrafts(set);
    if (parsed === null) return;
    if (isUnchanged(set, parsed)) return;

    try {
      await saveSet(
        set.id,
        section.workoutExerciseId,
        set.setNr,
        parsed.reps,
        parsed.weightKg,
      );
      setSections((prev) =>
        prev.map((s) =>
          s.workoutExerciseId === section.workoutExerciseId
            ? {
                ...s,
                sets: s.sets.map((existing) =>
                  existing.id === set.id
                    ? {
                        ...existing,
                        saved: parsed,
                        repsDraft: String(parsed.reps),
                        weightDraft: String(parsed.weightKg),
                      }
                    : existing,
                ),
              }
            : s,
        ),
      );
      setFlaggedSetIds((prev) => prev.filter((id) => id !== set.id));
    } catch (err) {
      Alert.alert(
        "Kunde inte spara ändringen",
        err instanceof Error ? err.message : "Okänt fel.",
      );
    }
  }

  function removeSetRow(section: Section, set: LoggedSet) {
    // nextSetNr rörs inte - numret får aldrig återanvändas.
    setSections((prev) =>
      prev.map((s) =>
        s.workoutExerciseId === section.workoutExerciseId
          ? { ...s, sets: s.sets.filter((existing) => existing.id !== set.id) }
          : s,
      ),
    );
    setFlaggedSetIds((prev) => prev.filter((id) => id !== set.id));
    delete firstInputs.current[set.id];
  }

  function confirmDeleteSet(section: Section, set: LoggedSet, label: number) {
    if (set.saved === null) {
      removeSetRow(section, set);
      return;
    }

    Alert.alert(
      "Ta bort set?",
      `Set ${label} (${set.saved.reps} reps × ${set.saved.weightKg} kg) tas bort. Det går inte att ångra.`,
      [
        { text: "Avbryt", style: "cancel" },
        {
          text: "Ta bort",
          style: "destructive",
          onPress: () => void handleDeleteSet(section, set),
        },
      ],
    );
  }

  async function handleDeleteSet(section: Section, set: LoggedSet) {
    try {
      await deleteSet(set.id);
      removeSetRow(section, set);
    } catch (err) {
      Alert.alert(
        "Kunde inte ta bort setet",
        err instanceof Error ? err.message : "Okänt fel.",
      );
    }
  }

  function confirmRemoveExercise(section: Section) {
    const savedCount = section.sets.filter((s) => s.saved !== null).length;
    Alert.alert(
      "Ta bort övning?",
      savedCount === 0
        ? `${section.exerciseName} tas bort från passet.`
        : `${section.exerciseName} och dess ${savedCount} set tas bort. Det går inte att ångra.`,
      [
        { text: "Avbryt", style: "cancel" },
        {
          text: "Ta bort",
          style: "destructive",
          onPress: () => void handleRemoveExercise(section),
        },
      ],
    );
  }

  async function handleRemoveExercise(section: Section) {
    try {
      await removeExerciseFromWorkout(section.workoutExerciseId);
      delete nextSetNr.current[section.workoutExerciseId];
      const removedIds = new Set(section.sets.map((s) => s.id));
      for (const id of removedIds) delete firstInputs.current[id];
      setSections((prev) =>
        prev.filter((s) => s.workoutExerciseId !== section.workoutExerciseId),
      );
      setFlaggedSetIds((prev) => prev.filter((id) => !removedIds.has(id)));
    } catch (err) {
      Alert.alert(
        "Kunde inte ta bort övningen",
        err instanceof Error ? err.message : "Okänt fel.",
      );
    }
  }

  // Samma väg som i det pågående passet: filen kopieras lokalt och
  // läggs i uppladdningskön. Skärmen öppnades med tömd kö, men det
  // hindrar inte att man lägger till nytt medan man är kvar här - det
  // nya visas från sin lokala fil tills det kommit fram.
  async function handleAddMedia() {
    const imported = await pickWorkoutMedia();
    if (imported === null) return;
    try {
      const persisted = await addWorkoutMedia(userId, workoutId, imported);
      setMedia((prev) => [
        ...prev,
        {
          id: persisted.id,
          mediaType: persisted.mediaType,
          storagePath: persisted.storagePath,
          durationMs: persisted.durationMs,
          localUri: persisted.localUri,
        },
      ]);
    } catch (err) {
      Alert.alert(
        "Kunde inte lägga till filen",
        err instanceof Error ? err.message : "Okänt fel.",
      );
    }
  }

  function confirmRemoveMedia(item: MediaItem) {
    Alert.alert(
      item.mediaType === "video" ? "Ta bort videon?" : "Ta bort bilden?",
      "Den tas bort från passet. Det går inte att ångra.",
      [
        { text: "Avbryt", style: "cancel" },
        {
          text: "Ta bort",
          style: "destructive",
          onPress: () => void handleRemoveMedia(item.id),
        },
      ],
    );
  }

  async function handleRemoveMedia(mediaId: string) {
    const target = media.find((item) => item.id === mediaId);
    if (!target) return;
    try {
      // Tar bort raden, filen OCH en eventuell uppladdning som inte
      // hunnit köras - se removeWorkoutMedia.
      await removeWorkoutMedia(userId, target.id, target.storagePath);
    } catch (err) {
      Alert.alert(
        "Kunde inte ta bort filen",
        err instanceof Error ? err.message : "Okänt fel.",
      );
      return;
    }
    setViewerIndex(null);
    setMedia((prev) => prev.filter((item) => item.id !== mediaId));
  }

  function confirmDeleteWorkout() {
    const setCount = sections.reduce(
      (total, section) =>
        total + section.sets.filter((s) => s.saved !== null).length,
      0,
    );
    Alert.alert(
      "Ta bort passet?",
      setCount === 0
        ? "Passet tas bort ur historiken. Det går inte att ångra."
        : `Passet och dess ${setCount} loggade set tas bort ur historiken. Det går inte att ångra.`,
      [
        { text: "Avbryt", style: "cancel" },
        {
          text: "Ta bort",
          style: "destructive",
          onPress: () => void handleDeleteWorkout(),
        },
      ],
    );
  }

  async function handleDeleteWorkout() {
    try {
      // Övningar och set städas av `on delete cascade`.
      await deleteWorkout(workoutId);
      // Mediaraderna också - men INTE filerna. Storage vet ingenting om
      // public-schemat, så de måste tas bort uttryckligen.
      await removeAllWorkoutMedia(userId, media);
    } catch (err) {
      Alert.alert(
        "Kunde inte ta bort passet",
        err instanceof Error ? err.message : "Okänt fel.",
      );
      return;
    }
    onClose();
  }

  // Namn och tider skrivs HÄR, inte löpande som set-raderna. De är tre
  // kolumner på samma rad och blir en enda update - att skriva vid varje
  // tangenttryck och varje snurr på datumhjulet hade fyllt synk-kön med
  // uppdateringar av samma rad. Set-rader är tvärtom många och
  // oberoende, och där är löpande skrivning hela poängen.
  async function handleDone() {
    if (!startedAt || !endedAt) return;

    // Tiderna först: det felet går inte att rätta genom att fylla i en
    // rad, så det ska inte gömmas bakom en lista över tomma set.
    if (endedAt.getTime() < startedAt.getTime()) {
      Alert.alert(
        "Sluttiden ligger före starten",
        "Passet måste sluta efter att det började. Justera start- eller sluttiden.",
      );
      return;
    }

    // Valideringen är helt fri från sidoeffekter: skrevs ett giltigt set
    // redan under insamlingen skulle det hamna i kön även när "Klar"
    // blockeras av ett ANNAT set. Raden hade då legat på servern med
    // saved === null lokalt, och ett efterföljande ✕ hade tagit bort den
    // bara från skärmen.
    const problems: { setId: string | null; label: string }[] = [];
    const writes: {
      set: LoggedSet;
      section: Section;
      parsed: { reps: number; weightKg: number };
    }[] = [];

    const committed = sections.map((section) => {
      if (section.sets.length === 0) {
        problems.push({
          setId: null,
          label: `${section.exerciseName} – inga set`,
        });
        return section;
      }
      return {
        ...section,
        sets: section.sets.map((set, index) => {
          const parsed = parseSetDrafts(set);
          if (parsed === null) {
            problems.push({
              setId: set.id,
              label: `${section.exerciseName} – set ${index + 1}`,
            });
            return set;
          }
          if (isUnchanged(set, parsed)) return set;
          writes.push({ set, section, parsed });
          return {
            ...set,
            saved: parsed,
            repsDraft: String(parsed.reps),
            weightDraft: String(parsed.weightKg),
          };
        }),
      };
    });

    if (problems.length > 0) {
      const lines = problems.slice(0, 5).map((p) => `• ${p.label}`);
      if (problems.length > lines.length) {
        lines.push(`…och ${problems.length - lines.length} till`);
      }
      setFlaggedSetIds(
        problems.map((p) => p.setId).filter((id): id is string => id !== null),
      );
      const firstSetId = problems.find((p) => p.setId !== null)?.setId;
      Alert.alert(
        "Fyll i alla set",
        `Fyll i eller ta bort följande innan du sparar:\n\n${lines.join("\n")}`,
        [
          {
            text: "OK",
            onPress: () => {
              if (firstSetId) firstInputs.current[firstSetId]?.focus();
            },
          },
        ],
      );
      return;
    }

    setFlaggedSetIds([]);
    try {
      await Promise.all(
        writes.map((w) =>
          saveSet(
            w.set.id,
            w.section.workoutExerciseId,
            w.set.setNr,
            w.parsed.reps,
            w.parsed.weightKg,
          ),
        ),
      );
      setSections(committed);

      const meta = savedMeta.current;
      const trimmed = nameDraft.trim();
      const name = trimmed === "" ? null : trimmed;
      // Tidsstämplarna jämförs som TIDPUNKTER. Servern svarar med
      // "…+00:00" och toISOString() ger "…Z" - som strängar skiljer de
      // sig alltid, och varje "Klar" hade köat en uppdatering av tider
      // som inte rörts.
      const timesChanged =
        meta === null ||
        Date.parse(meta.startedAt) !== startedAt.getTime() ||
        Date.parse(meta.endedAt) !== endedAt.getTime();

      const patch = {
        ...(meta === null || name !== meta.name ? { name } : {}),
        ...(timesChanged
          ? {
              times: {
                startedAt: startedAt.toISOString(),
                endedAt: endedAt.toISOString(),
              },
            }
          : {}),
      };
      if (Object.keys(patch).length > 0) {
        await updateWorkoutDetails(workoutId, patch);
      }
    } catch (err) {
      Alert.alert(
        "Kunde inte spara ändringarna",
        err instanceof Error ? err.message : "Okänt fel.",
      );
      return;
    }

    onClose();
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

  const durationMinutes =
    startedAt && endedAt
      ? Math.round((endedAt.getTime() - startedAt.getTime()) / 60000)
      : null;

  // Nytillagt visas från den lokala filen, redan uppladdat från sin
  // signerade URL. null medan signeringen pågår - rutan blir tom istället
  // för att försvinna, så antalet inte hoppar.
  const mediaItems: MediaItem[] = media.map((item) => ({
    id: item.id,
    mediaType: item.mediaType,
    uri: item.localUri ?? mediaUrls.get(item.storagePath) ?? null,
    durationMs: item.durationMs,
    pending: pendingMediaIds.includes(item.id),
  }));

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
        // Utan detta går första trycket på ✕ eller "Lägg till set" åt
        // till att stänga tangentbordet istället för att träffa knappen.
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>Redigera pass</Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Namn</Text>
          {/* Platshållaren är datumet, inte ett förvalt passnamn. Här
              betyder ett tomt fält att kolumnen sätts till null, och då
              ÄR datumet rubriken. Att visa "Gym på förmiddagen" i grått
              hade lovat något annat än vad som faktiskt händer - till
              skillnad från fältet i det pågående passet, där det
              förvalda namnet verkligen skrivs. */}
          <TextInput
            style={styles.input}
            value={nameDraft}
            onChangeText={setNameDraft}
            placeholder={startedAt ? formatDate(startedAt) : ""}
            placeholderTextColor={colors.textFaint}
            maxLength={WORKOUT_NAME_MAX_LENGTH}
            autoCapitalize="sentences"
            returnKeyType="done"
          />
          <Text style={styles.hintText}>
            Utan namn visas passets datum.
          </Text>

          {startedAt && (
            <DateTimeField label="Start" value={startedAt} onChange={setStartedAt} />
          )}
          {endedAt && (
            <DateTimeField label="Slut" value={endedAt} onChange={setEndedAt} />
          )}
          {durationMinutes !== null && (
            <Text
              style={durationMinutes < 0 ? styles.errorText : styles.hintText}
            >
              {durationMinutes < 0
                ? "Sluttiden ligger före starten."
                : `Längd: ${durationMinutes} min`}
            </Text>
          )}
        </View>

        {sections.map((section) => (
          <ExerciseSection
            key={section.workoutExerciseId}
            title={section.exerciseName}
            sets={section.sets}
            previousSets={NO_PREVIOUS_SETS}
            flaggedSetIds={flaggedSetIds}
            pendingFocusId={pendingFocusId}
            inputRefs={firstInputs}
            onFocusHandled={() => setPendingFocusId(null)}
            onChangeDraft={(setId, field, value) =>
              updateSetDraft(section.workoutExerciseId, setId, field, value)
            }
            onCommitSet={(s) => void commitSetEdit(section, s)}
            onDeleteSet={(s, label) => confirmDeleteSet(section, s, label)}
            onAddSet={() => handleCreateSetRow(section)}
            onRemoveExercise={() => confirmRemoveExercise(section)}
          />
        ))}

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => setPickerOpen(true)}
        >
          <Text style={styles.secondaryButtonText}>Lägg till övning</Text>
        </TouchableOpacity>

        {/* Samma placering som i det pågående passet - sist, efter
            övningarna. */}
        <MediaStrip
          items={mediaItems}
          onAdd={() => void handleAddMedia()}
          onRemove={confirmRemoveMedia}
          onOpen={setViewerIndex}
        />

        <TouchableOpacity onPress={confirmDeleteWorkout}>
          <Text style={styles.deleteWorkoutText}>Ta bort passet</Text>
        </TouchableOpacity>
      </ScrollView>

      <SyncStatusBanner
        online={online}
        pendingCount={pendingCount}
        pendingMediaCount={pendingMediaCount}
        offlineLabel="Offline – ändringarna sparas lokalt och synkas senare"
      />

      <TouchableOpacity style={styles.doneButton} onPress={() => void handleDone()}>
        <Text style={styles.doneButtonText}>Klar</Text>
      </TouchableOpacity>

      <ExercisePicker
        visible={pickerOpen}
        catalog={catalog}
        onPick={(exercise) => void handlePickExercise(exercise)}
        onClose={() => setPickerOpen(false)}
        onCreate={async (name, muscleGroup) => {
          const exercise = await createCustomExercise(userId, name, muscleGroup);
          // filter, inte append: samma anrop materialiserar en post ur
          // DEFAULT_EXERCISE_CATALOG (samma namn, fallback: true) till en
          // riktig rad - annars stod placeholdern och dubbletten kvar
          // bredvid varandra i samma lista.
          setCatalog((prev) => [...prev.filter((e) => e.name !== exercise.name), exercise]);
          return exercise;
        }}
      />

      {viewerIndex !== null && viewerIndex < mediaItems.length && (
        <MediaViewer
          items={mediaItems}
          initialIndex={viewerIndex}
          onClose={() => setViewerIndex(null)}
        />
      )}
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
    gap: 12,
    ...shadows.card,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.ink,
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
  hintText: {
    color: colors.textMuted,
    fontSize: 13,
  },
  errorText: {
    color: colors.danger,
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
  linkText: {
    color: colors.textMuted,
    paddingVertical: 8,
  },
  deleteWorkoutText: {
    textAlign: "center",
    color: colors.danger,
    paddingVertical: 8,
  },
  doneButton: {
    backgroundColor: colors.accent,
    borderRadius: radii.lg,
    paddingVertical: 16,
    alignItems: "center",
    ...shadows.accentButton,
  },
  doneButtonText: {
    color: colors.onAccent,
    fontSize: 16,
    fontWeight: "700",
  },
});
