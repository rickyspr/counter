import {
  defaultWorkoutName,
  WORKOUT_NAME_MAX_LENGTH,
} from "@repcount/shared";
import { useEffect, useRef, useState } from "react";
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
import { ExercisePicker } from "../components/ExercisePicker";
import { ExerciseSection } from "../components/ExerciseSection";
import { MediaStrip } from "../components/MediaStrip";
import { MediaViewer } from "../components/MediaViewer";
import { SyncStatusBanner } from "../components/SyncStatusBanner";
import { useSyncStatus } from "../lib/use-sync-status";
import {
  clearActiveWorkout,
  loadActiveWorkout,
  saveActiveWorkout,
  type ActiveWorkout,
  type PersistedMedia,
} from "../lib/active-workout";
import type { MediaItem } from "../lib/media-item";
import { pickWorkoutMedia } from "../lib/media-picker";
import { subscribeToPendingMediaIds } from "../lib/media-queue";
import {
  addExerciseToWorkout,
  addWorkoutMedia,
  createCustomExercise,
  deleteSet,
  deleteWorkout,
  endWorkout,
  fetchExerciseCatalog,
  fetchPreviousSetsForExercise,
  newSetId,
  removeAllWorkoutMedia,
  removeExerciseFromWorkout,
  removeWorkoutMedia,
  saveSet,
  type ExerciseOption,
  type PreviousSet,
} from "../lib/queries";
import {
  isUnchanged,
  parseSetDrafts,
  type LoggedSet,
} from "../lib/set-parsing";

interface Props {
  userId: string;
  workoutId: string;
  onFinish: () => void;
  onDiscard: () => void;
}

interface Section {
  workoutExerciseId: string;
  exerciseId: string;
  exerciseName: string;
  sets: LoggedSet[];
  // Vad användaren körde på samma övning förra passet, i positions-
  // ordning. Visas som grå platshållare - inte som värden.
  previousSets: PreviousSet[];
}

export function ActiveWorkoutScreen({
  userId,
  workoutId,
  onFinish,
  onDiscard,
}: Props) {
  const [catalog, setCatalog] = useState<ExerciseOption[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  // Tomt = odöpt. Passet får då sitt förvalda namn vid avslutet, och
  // det namnet visas redan som grå platshållare i fältet.
  const [nameDraft, setNameDraft] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  // Tills det sparade passet lästs in får ingenting sparas tillbaka -
  // se hydreringen nedan.
  const [hydrated, setHydrated] = useState(false);
  // Raden som just skapats och ska få markören.
  const [pendingFocusId, setPendingFocusId] = useState<string | null>(null);
  // Rader som varningen vid avslut pekat ut. Markeras röda. Sätts först
  // vid avslut - en rad man håller på att fylla i ska inte lysa röd
  // medan man skriver.
  const [flaggedSetIds, setFlaggedSetIds] = useState<string[]>([]);
  // Media ligger LOKALT under hela passet - servern läses aldrig här.
  // Byte:sen kan ligga kvar i uppladdningskön i timmar, och ett pass som
  // loggas offline har ingenting alls på servern att läsa.
  const [media, setMedia] = useState<PersistedMedia[]>([]);
  const [pendingMediaIds, setPendingMediaIds] = useState<string[]>([]);
  // Index i mediaremsan som helskärmsvyn visar. null = stängd.
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const { online, pendingCount, pendingMediaCount } = useSyncStatus();

  useEffect(() => subscribeToPendingMediaIds(setPendingMediaIds), []);

  // Nästa lediga set_nr per övning, och nästa lediga order_index för
  // passet. Båda är monotona och återanvänds ALDRIG, inte ens efter en
  // borttagning: sets.length + 1 skulle krocka med ett kvarvarande
  // set_nr (unique (workout_exercise_id, set_nr)) och upserten i
  // synk-kön skulle då skriva över det setet i tysthet. Samma sak för
  // order_index mot unique (workout_id, order_index).
  //
  // De ligger i refs, inte i state, så att numret kan reserveras
  // synkront INNAN await:en - annars kan två snabba tryck läsa samma
  // nummer och det andra setet skriva över det första.
  const nextSetNr = useRef<Record<string, number>>({});
  const nextOrderIndex = useRef(0);
  const firstInputs = useRef<Record<string, TextInput | null>>({});
  // startedAt ägs av den sparade blobben (HomeScreen skriver den när
  // passet startas) och skickas bara tillbaka oförändrad vid varje spar.
  const startedAt = useRef(new Date().toISOString());
  // Sätts när passet avslutats eller avbrutits. Avväpnar spar-effekten
  // så att en sen setSections (t.ex. ett commitSetEdit som landar mellan
  // rensningen och att skärmen försvinner) inte kan skriva tillbaka
  // blobben och få ett FÄRDIGT pass att dyka upp som "pågående" igen.
  const finished = useRef(false);

  // Läser tillbaka passet från disk. HomeScreen skriver alltid en blob
  // när passet startas, så det här är samma kodväg för ett splitternytt
  // pass som för ett återupptaget - skillnaden är bara att sections är
  // tom i det första fallet.
  useEffect(() => {
    let cancelled = false;
    loadActiveWorkout(userId)
      .then((stored) => {
        if (cancelled) return;
        if (stored && stored.workoutId === workoutId) {
          nextOrderIndex.current = stored.nextOrderIndex;
          nextSetNr.current = { ...stored.nextSetNr };
          startedAt.current = stored.startedAt;
          setNameDraft(stored.name ?? "");
          setSections(stored.sections);
          setMedia(stored.media ?? []);
        }
        setHydrated(true);
      })
      .catch(() => {
        if (!cancelled) setHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, workoutId]);

  function snapshot(
    currentSections: Section[],
    currentName: string = nameDraft,
    currentMedia: PersistedMedia[] = media,
  ): ActiveWorkout {
    return {
      version: 1,
      userId,
      workoutId,
      startedAt: startedAt.current,
      name: currentName,
      nextOrderIndex: nextOrderIndex.current,
      nextSetNr: nextSetNr.current,
      sections: currentSections,
      media: currentMedia,
    };
  }

  // Skriver blobben direkt istället för att vänta på spar-effekten.
  // Fel sväljs INTE här: kan räknaren inte sparas ska åtgärden som
  // förbrukar den inte köas heller.
  function persistCounters(): Promise<void> {
    return saveActiveWorkout(snapshot(sections));
  }

  // Sparar hela skärmtillståndet vid varje ändring, så ett pass
  // överlever att appen swipas bort.
  //
  // `hydrated`-vakten är inte valfri: utan den skriver den här effekten
  // sections: [] över den sparade blobben direkt vid mount, alltså
  // raderas passet i samma ögonblick som man försöker återuppta det.
  //
  // `sections`, `nameDraft` och `media` är allt som behöver lyssnas på.
  // Räknarna följer med gratis: varje mutation av
  // nextSetNr/nextOrderIndex följs av ett setSections i samma handler
  // (handlePickExercise, handleCreateSetRow, handleRemoveExercise), så
  // refarna är alltid färska när effekten kör.
  useEffect(() => {
    if (!hydrated || finished.current) return;
    saveActiveWorkout(snapshot(sections)).catch(() => {
      // Tyst med flit: det här körs vid varje tangenttryck, och en
      // dialog per tecken vore både omöjlig att jobba i och något
      // användaren ändå inte kan göra något åt. Själva passet ligger
      // redan säkert i synk-kön - det som riskeras är återupptagningen.
    });
  }, [hydrated, sections, nameDraft, media, userId, workoutId]);

  useEffect(() => {
    // Om detta misslyckas finns varken nät eller en sparad kopia av
    // övningskatalogen (se lib/queries.ts) - händer bara om appen
    // aldrig varit online sedan installation.
    fetchExerciseCatalog()
      .then(setCatalog)
      .catch(() =>
        Alert.alert(
          "Kunde inte hämta övningar",
          "Ingen uppkoppling och ingen sparad övningslista än. Öppna appen minst en gång med nät innan du loggar helt offline.",
        ),
      );
  }, []);

  // Skrivfunktionerna går via en lokal synk-kö (se lib/offline-queue.ts)
  // - de väntar bara in det lokala sparandet (millisekunder), inte
  // nätverket, så hela passet går att logga offline utan fördröjning.
  async function handlePickExercise(exercise: ExerciseOption) {
    setPickerOpen(false);
    const orderIndex = nextOrderIndex.current;
    nextOrderIndex.current += 1;
    try {
      // Den förbrukade räknaren måste nå disken INNAN åtgärden köas,
      // inte via spar-effekten några tick senare. Dör appen i glappet
      // ligger order_index = n i kön medan blobben fortfarande säger
      // "nästa lediga är n", och nästa övning får samma nummer. Då
      // fäller unique (workout_id, order_index) upserten med 23505 -
      // ett permanent fel, så kön SLÄNGER åtgärden, och setsen under
      // övningen ryker med den på sin trasiga referens.
      await persistCounters();
      const workoutExercise = await addExerciseToWorkout(
        workoutId,
        exercise.id,
        orderIndex,
      );
      // Man vill alltid ha minst ett set, så övningen kommer med rad 1
      // redan på plats - annars blir "Lägg till set" ett obligatoriskt
      // extratryck efter varje övning. Raden är tom, alltså saved: null
      // och aldrig köad (se LoggedSet); den skrivs först när båda fälten
      // går att tolka.
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
          previousSets: [],
        },
      ]);

      // Skuggvärdena är rent stöd - de hämtas i bakgrunden och fyller på
      // sektionen när de kommer. Blir det inget svar syns bara inga
      // platshållare.
      void fetchPreviousSetsForExercise(userId, exercise.id)
        .then((previousSets) => {
          setSections((prev) =>
            prev.map((s) =>
              s.workoutExerciseId === workoutExercise.id
                ? { ...s, previousSets }
                : s,
            ),
          );
        })
        .catch(() => {});
    } catch (err) {
      Alert.alert(
        "Kunde inte lägga till övning",
        err instanceof Error ? err.message : "Okänt fel.",
      );
    }
  }

  // Lägger ALLTID till en ny rad, även om den förra fortfarande är tom:
  // knappen ska göra det den heter. Tomma rader kostar ingenting i
  // databasen (de köas aldrig) och avslutet kräver ändå att varje rad
  // fylls i eller tas bort med ✕.
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

  // Körs när ett fält tappar fokus. Ett tomt eller ogiltigt värde gör
  // ingenting alls - ingen dialog, ingen återställning. Man ska kunna
  // hoppa mellan reps och vikt utan att bli avbruten; allt som saknas
  // fångas istället av varningen vid "Avsluta pass".
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
    // En rad som aldrig sparats finns bara på skärmen - inget att
    // bekräfta och inget att ta bort på servern.
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
      // nextOrderIndex och räknaren för övningen rörs inte - numren får
      // aldrig återanvändas.
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

  // Filen kopieras till appens egen katalog av väljaren och läggs sedan
  // i uppladdningskön. Ingenting väntar på nätet: rutan syns direkt, och
  // byte:sen skickas i bakgrunden när det finns uppkoppling.
  async function handleAddMedia() {
    const imported = await pickWorkoutMedia();
    // null = avbrutet, nekad behörighet, eller ett fel som väljaren
    // redan visat en dialog för.
    if (imported === null) return;
    try {
      const persisted = await addWorkoutMedia(userId, workoutId, imported);
      setMedia((prev) => [...prev, persisted]);
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
    const target = media.find((m) => m.id === mediaId);
    if (!target) return;
    try {
      await removeWorkoutMedia(userId, target.id, target.storagePath);
    } catch (err) {
      Alert.alert(
        "Kunde inte ta bort filen",
        err instanceof Error ? err.message : "Okänt fel.",
      );
      return;
    }
    // Stängs alltid: index i visaren pekar på en lista som just blivit
    // kortare, och det man tittade på finns inte längre.
    setViewerIndex(null);
    setMedia((prev) => prev.filter((m) => m.id !== mediaId));
  }

  async function handleFinish() {
    // Ett tryck på "Avsluta pass" triggar inte pålitligt onBlur på ett
    // fokuserat fält, så drafts - inte `saved` - är källan här.
    //
    // Valideringen måste vara helt fri från sidoeffekter: skrevs ett
    // giltigt set redan under insamlingen skulle det hamna i kön även
    // när avslutet blockeras av ett ANNAT set. Raden hade då legat på
    // servern med saved === null lokalt, och ett efterföljande ✕ hade
    // tagit bort den bara från skärmen och lämnat kvar den i databasen.
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
        `Fyll i eller ta bort följande innan du avslutar:\n\n${lines.join("\n")}`,
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

    // Har `problems` inte stoppat oss finns det, för varje section, redan
    // minst ett satt/skrivet set - annars hade den flaggats som "inga set"
    // eller "unparseable" ovan. Så `sections.length === 0` är precis
    // liktydigt med "inget set någonsin loggat". Media räknas som värdefullt
    // i sig - ett pass med bilder men utan set behåll, inte kastas.
    if (sections.length === 0 && media.length === 0) {
      try {
        await deleteWorkout(workoutId);
        await removeAllWorkoutMedia(userId, media);
      } catch (err) {
        Alert.alert(
          "Kunde inte avsluta passet",
          err instanceof Error ? err.message : "Okänt fel.",
        );
        return;
      }
      finished.current = true;
      await clearActiveWorkout().catch(() => {});
      onDiscard();
      return;
    }

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
      // Odöpt pass får det förvalda namnet HÄR, inte i databasen: en
      // default i schemat hade inte kunnat läsa av starttidens timme i
      // användarens tidszon, och en trigger hade gissat på serverns.
      await endWorkout(
        workoutId,
        nameDraft.trim() || defaultWorkoutName(startedAt.current),
      );
    } catch (err) {
      Alert.alert(
        "Kunde inte avsluta passet",
        err instanceof Error ? err.message : "Okänt fel.",
      );
      return;
    }

    // Härifrån ÄR passet avslutat. Rensningen ligger utanför try:n ovan
    // med flit: misslyckas den får det inte se ut som att avslutet
    // misslyckades, för då skulle användaren bli kvar på ett pass som
    // redan är avslutat - och kunna trycka "Släng" på det senare.
    finished.current = true;
    await clearActiveWorkout().catch(() => {});
    onFinish();
  }

  function confirmDiscardWorkout() {
    const setCount = sections.reduce(
      (total, section) =>
        total + section.sets.filter((s) => s.saved !== null).length,
      0,
    );
    Alert.alert(
      "Avbryt pass?",
      setCount === 0
        ? "Passet tas bort. Det går inte att ångra."
        : `Passet och dess ${setCount} loggade set tas bort. Det går inte att ångra.`,
      [
        { text: "Fortsätt passet", style: "cancel" },
        {
          text: "Avbryt pass",
          style: "destructive",
          onPress: () => void handleDiscardWorkout(),
        },
      ],
    );
  }

  async function handleDiscardWorkout() {
    try {
      await deleteWorkout(workoutId);
      // Raderna under passet städas av `on delete cascade`, men Storage
      // vet ingenting om det - filerna måste tas bort uttryckligen, och
      // uppladdningar som ännu inte körts avbrytas.
      await removeAllWorkoutMedia(userId, media);
    } catch (err) {
      Alert.alert(
        "Kunde inte avbryta passet",
        err instanceof Error ? err.message : "Okänt fel.",
      );
      return;
    }

    // Samma resonemang som i handleFinish: raderingen är beställd, så
    // passet ska inte ligga kvar som pågående även om rensningen strular.
    finished.current = true;
    await clearActiveWorkout().catch(() => {});
    onDiscard();
  }

  // Att rendera passet innan blobben lästs in skulle visa ett tomt pass
  // i ett ögonblick även när det finns set att återuppta.
  if (!hydrated) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator />
      </View>
    );
  }

  const mediaItems: MediaItem[] = media.map((item) => ({
    id: item.id,
    mediaType: item.mediaType,
    // Alltid den lokala filen. Under ett pågående pass finns ingen
    // signerad URL att hämta - och skulle inte behövas om den fanns.
    uri: item.localUri,
    durationMs: item.durationMs,
    pending: pendingMediaIds.includes(item.id),
  }));

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        // Utan detta går första trycket på ✕ eller "Lägg till set" åt
        // till att stänga tangentbordet istället för att träffa knappen.
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>Pågående pass</Text>

        {/* Platshållaren ÄR det förvalda namnet, inte ett exempel: låter
            man fältet stå tomt är det precis det passet kommer att heta.
            Därför en platshållare och inte ett ifyllt värde - man ska
            slippa radera ett namn man inte skrivit för att skriva sitt
            eget. */}
        <TextInput
          style={styles.nameInput}
          value={nameDraft}
          onChangeText={setNameDraft}
          placeholder={defaultWorkoutName(startedAt.current)}
          placeholderTextColor="#9ca3af"
          maxLength={WORKOUT_NAME_MAX_LENGTH}
          autoCapitalize="sentences"
          returnKeyType="done"
        />

        {sections.map((section) => (
          <ExerciseSection
            key={section.workoutExerciseId}
            title={section.exerciseName}
            sets={section.sets}
            previousSets={section.previousSets}
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

        {/* Ligger sist, efter övningarna: media är något man lägger till
            en gång, oftast mot slutet, medan set-raderna är det man
            arbetar i hela passet. Överst hade den knuffat ned varje
            övning permanent. */}
        <MediaStrip
          items={mediaItems}
          onAdd={() => void handleAddMedia()}
          onRemove={confirmRemoveMedia}
          onOpen={setViewerIndex}
        />

        <TouchableOpacity onPress={confirmDiscardWorkout}>
          <Text style={styles.discardText}>Avbryt pass</Text>
        </TouchableOpacity>
      </ScrollView>

      <SyncStatusBanner
        online={online}
        pendingCount={pendingCount}
        pendingMediaCount={pendingMediaCount}
        offlineLabel="Offline – loggas lokalt och synkas senare"
      />

      <TouchableOpacity style={styles.finishButton} onPress={handleFinish}>
        <Text style={styles.buttonText}>Avsluta pass</Text>
      </TouchableOpacity>

      <ExercisePicker
        visible={pickerOpen}
        catalog={catalog}
        onPick={(exercise) => void handlePickExercise(exercise)}
        onClose={() => setPickerOpen(false)}
        onCreate={async (name, muscleGroup) => {
          const exercise = await createCustomExercise(userId, name, muscleGroup);
          setCatalog((prev) => [...prev, exercise]);
          return exercise;
        }}
      />

      {/* Sist i trädet, så att overlayen hamnar överst. Den är med flit
          ingen Modal - se MediaViewer. Villkoret gör också att spelaren
          släpps när man stänger istället för att ligga kvar. */}
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
    backgroundColor: "#fff",
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
    fontWeight: "700",
  },
  nameInput: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: "#111827",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
  },
  secondaryButtonText: {
    color: "#111827",
    fontWeight: "600",
  },
  discardText: {
    textAlign: "center",
    color: "#b91c1c",
    paddingVertical: 8,
  },
  finishButton: {
    backgroundColor: "#b91c1c",
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});
