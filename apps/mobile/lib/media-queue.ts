import { WORKOUT_MEDIA_BUCKET, type MediaType } from "@repcount/shared";
import { File, UploadType } from "expo-file-system";
import { deleteLocalMedia, sweepOrphanedMedia } from "./media-store";
import { getOnlineStatus, onReconnect } from "./network";
import { enqueue } from "./offline-queue";
import { readJSON, writeJSON } from "./storage";
import { supabase, supabaseAnonKey, supabaseUrl } from "./supabase";

// Uppladdningskön: byte:sen, och bara byte:sen.
//
// Den är MEDVETET skild från synk-kön (offline-queue.ts), inte en
// åtgärdstyp i den. Två skäl, båda hårda:
//
// 1. Storleken. offline-queue.persist() skriver om HELA kön som en
//    JSON-sträng vid varje enqueue. En bild i kön hade serialiserats om
//    vid varje efterföljande set-sparning, och Androids AsyncStorage har
//    dessutom ett totaltak på några MB.
// 2. Blockeringen. Synk-kön stannar på sitt huvud tills åtgärden gått
//    igenom. En video på gymwifi hade låst varje set-skrivning bakom
//    sig - alltså exakt den data som absolut inte får bli kvar.
//
// Metadataraden går däremot genom synk-kön, som en vanlig liten
// "add_media" som köas FÖRST när byte:sen landat. Att den läggs där ger
// FK-ordningen gratis: FIFO gör att den hamnar bakom sitt
// "start_workout", och passet kan ha loggats helt offline.
//
// Ordningen bytes -> rad är inte utbytbar. Tvärtom hade historiken visat
// en trasig bild tills filen kom fram.

// Varje jobb är stämplat med sin ägare. Sökvägarna börjar med
// användarens id (Storage-policyerna hänger på det), så ett jobb som
// körs under fel inloggning avvisas av RLS - och skulle klassas som ett
// permanent fel, alltså en förlorad bild. Loopen nedan hoppar över dem
// istället.
type MediaJob =
  | {
      kind: "upload";
      userId: string;
      mediaId: string;
      workoutId: string;
      storagePath: string;
      localUri: string;
      mimeType: string;
      mediaType: MediaType;
      addedAt: string;
      width: number | null;
      height: number | null;
      durationMs: number | null;
      // Räknas bara upp för svar som KAN vara permanenta, se
      // classifyStatus. Rena "försök igen senare" (5xx, 429, nätverksfel)
      // rör den inte - annars hade en vecka utan nät bränt försöken.
      attempts: number;
    }
  | {
      // Städning av filer i Storage. `on delete cascade` når inte dit:
      // raderar man ett pass försvinner workout_media-raderna men
      // filerna blir kvar och äter kvot för alltid.
      kind: "remove";
      userId: string;
      storagePaths: string[];
      // Städning ger ALDRIG upp i all evighet. Ett "remove" som fastnar
      // ligger kvar på sin plats i kön och hindrar uppladdningarna bakom
      // sig - och det som står på spel är en fil ingen rad längre pekar
      // på, medan det som blockeras är användarens nya bilder. Efter
      // några försök släpps den och filen blir en föräldralös i
      // bucketen.
      attempts: number;
    };

interface StoredState {
  jobs: MediaJob[];
  // Media som användaren ångrat medan uppladdningen redan var i gång.
  // Se cancelUpload nedan - utan den kan en bild man precis raderat
  // återuppstå som en rad i workout_media.
  cancelled: string[];
  // Uppladdningar som gett upp. Den LOKALA filen ligger kvar (den är
  // enda exemplaret) och sopas inte bort av sweepOrphanedMedia.
  failed: MediaJob[];
}

const STORAGE_KEY = "repcount:media-queue";

// Efter så många svar som kan vara antingen ett utgånget token eller ett
// RLS-avslag ger vi upp. Ett obegränsat omförsök hade snurrat för evigt
// på ett avslag; noll omförsök hade slängt en bild för ett token som
// råkade gå ut mitt i.
const MAX_AMBIGUOUS_ATTEMPTS = 5;

let state: StoredState = { jobs: [], cancelled: [], failed: [] };
let loadPromise: Promise<void> | null = null;
let running = false;
// Den uppladdning som just nu är i luften, så att cancelUpload kan
// avbryta den istället för att vänta ut en video.
let inFlight: { mediaId: string; controller: AbortController } | null = null;

// Prenumeranterna får ID:na, inte bara antalet. Bannern behöver bara
// längden, men pass-skärmen ska kunna märka ut PRECIS vilka rutor som
// ännu inte nått servern - och två parallella prenumerationer på samma
// tillstånd hade kunnat hamna ur fas med varandra.
const pendingListeners = new Set<(mediaIds: string[]) => void>();
const errorListeners = new Set<(message: string) => void>();

function isJob(raw: unknown): raw is MediaJob {
  if (!raw || typeof raw !== "object") return false;
  const job = raw as Record<string, unknown>;
  if (typeof job.userId !== "string") return false;
  // Kontrolleras för båda sorterna. En post utan räknare hade gett
  // `undefined + 1` = NaN, och NaN >= taket är falskt - alltså ett jobb
  // som aldrig ger upp, vilket är precis det räknaren finns för att
  // förhindra.
  if (typeof job.attempts !== "number" || !Number.isFinite(job.attempts)) {
    return false;
  }
  if (job.kind === "remove") return Array.isArray(job.storagePaths);
  if (job.kind !== "upload") return false;
  return (
    typeof job.mediaId === "string" &&
    typeof job.workoutId === "string" &&
    typeof job.storagePath === "string" &&
    typeof job.localUri === "string" &&
    typeof job.mimeType === "string" &&
    typeof job.addedAt === "string"
  );
}

// readJSON gör en ovaliderad cast, så allt som kommer från disk måste
// kontrolleras - samma resonemang som parseStored i active-workout.ts.
// En trasig post ska tappas, inte krascha uppladdningen av resten.
function parseStored(raw: unknown): StoredState {
  if (!raw || typeof raw !== "object") return { jobs: [], cancelled: [], failed: [] };
  const value = raw as Partial<StoredState>;
  return {
    jobs: Array.isArray(value.jobs) ? value.jobs.filter(isJob) : [],
    cancelled: Array.isArray(value.cancelled)
      ? value.cancelled.filter((id): id is string => typeof id === "string")
      : [],
    failed: Array.isArray(value.failed) ? value.failed.filter(isJob) : [],
  };
}

function ensureLoaded(): Promise<void> {
  if (!loadPromise) {
    loadPromise = readJSON<unknown>(STORAGE_KEY, null).then((stored) => {
      state = parseStored(stored);
    });
  }
  return loadPromise;
}

async function persist(): Promise<void> {
  await writeJSON(STORAGE_KEY, state);
  const ids = pendingIds();
  for (const listener of pendingListeners) listener(ids);
}

// Bara uppladdningar. Ett "remove"-jobb är städning av en fil som ingen
// rad längre pekar på - användaren väntar inte på det, och det ska inte
// hindra redigeringsskärmen från att öppna.
function pendingIds(): string[] {
  return state.jobs
    .filter((job) => job.kind === "upload")
    .map((job) => job.mediaId);
}

function notifyError(message: string): void {
  for (const listener of errorListeners) listener(message);
}

// Vad ett HTTP-svar ska leda till.
//
// Uppdelningen i "retry" och "maybe" är hela poängen: 401 och 403 kan
// vara både ett token som gick ut mitt i uppladdningen (övergående) och
// ett RLS-avslag (permanent), och de går inte att skilja åt i svaret.
// De får därför ett begränsat antal försök istället för antingen eller.
type StatusVerdict = "ok" | "retry" | "maybe" | "permanent";

function classifyStatus(status: number): StatusVerdict {
  if (status >= 200 && status < 300) return "ok";
  // Servern har uttryckligen sagt "senare".
  if (status >= 500 || status === 408 || status === 429) return "retry";
  if (status === 401 || status === 403) return "maybe";
  // 400, 404, 413 (för stor), 415 (fel mimetype) - kommer aldrig gå
  // igenom hur många gånger vi än försöker.
  return "permanent";
}

// supabase-js kan inte användas för uppladdningen: dess upload() vill ha
// hela filen i minnet (Blob/ArrayBuffer), vilket är dödsdomen för en
// video. Expos File.upload streamar istället från disk, och på iOS i en
// bakgrundssession som överlever att appen läggs undan.
function uploadUrl(storagePath: string): string {
  // Varje segment kodas för sig - sökvägen innehåller "/" som ska
  // förbli separatorer, medan allt annat måste escapas.
  const encoded = storagePath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `${supabaseUrl}/storage/v1/object/${WORKOUT_MEDIA_BUCKET}/${encoded}`;
}

type JobOutcome = "done" | "retry" | "failed";

function describe(job: Extract<MediaJob, { kind: "upload" }>): string {
  return job.mediaType === "video" ? "video" : "bild";
}

async function runUpload(
  job: Extract<MediaJob, { kind: "upload" }>,
  accessToken: string,
): Promise<JobOutcome> {
  const file = new File(job.localUri);
  if (!file.exists) {
    // Filen raderas ALLTID sist, efter att raden köats (se nedan). Att
    // den är borta betyder alltså att jobbet redan är utfört och att vi
    // dog innan kön hann uppdateras - inte att bilden gått förlorad.
    return "done";
  }

  const controller = new AbortController();
  inFlight = { mediaId: job.mediaId, controller };
  let status: number;
  let body: string;
  try {
    const result = await file.upload(uploadUrl(job.storagePath), {
      httpMethod: "POST",
      uploadType: UploadType.BINARY_CONTENT,
      mimeType: job.mimeType,
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": job.mimeType,
        // Ett omförsök efter ett tappat svar ska skriva över sig självt,
        // inte krocka med en 409. Samma resonemang som upserterna i
        // synk-kön.
        "x-upsert": "true",
      },
      signal: controller.signal,
    });
    status = result.status;
    body = result.body;
  } catch {
    // File.upload avvisar bara vid avbrott eller när anropet aldrig kom
    // fram. Båda är övergående - avbrottet hanteras av cancelUpload, som
    // redan tagit bort jobbet.
    return "retry";
  } finally {
    inFlight = null;
  }

  const verdict = classifyStatus(status);
  if (verdict === "retry") return "retry";
  if (verdict === "maybe") {
    // Räknaren rörs BARA här. Ett 5xx eller ett tapp i nätet ska kunna
    // upprepas hur många gånger som helst - annars hade en helg utan
    // uppkoppling bränt försöken på ingenting.
    job.attempts += 1;
    if (job.attempts < MAX_AMBIGUOUS_ATTEMPTS) return "retry";
    notifyError(
      `Kunde inte ladda upp en ${describe(job)} – åtkomsten nekades (${status}). Filen finns kvar i appen.`,
    );
    return "failed";
  }
  if (verdict === "permanent") {
    notifyError(
      `Kunde inte ladda upp en ${describe(job)} (${status}). ${body.slice(0, 120)}`,
    );
    return "failed";
  }

  // Byte:sen ligger uppe. Ångrade sig användaren under tiden ska raden
  // ALDRIG skrivas - då hade bilden återuppstått i historiken. Filen
  // städas av det "remove"-jobb cancelUpload lade i kön.
  if (state.cancelled.includes(job.mediaId)) {
    deleteLocalMedia(job.localUri);
    return "done";
  }

  await enqueue({
    type: "add_media",
    id: job.mediaId,
    workout_id: job.workoutId,
    media_type: job.mediaType,
    storage_path: job.storagePath,
    added_at: job.addedAt,
    width: job.width,
    height: job.height,
    duration_ms: job.durationMs,
  });
  // Sist, alltid. Se vakten överst i den här funktionen: att filen är
  // borta är vad som betyder "redan klart".
  deleteLocalMedia(job.localUri);
  return "done";
}

async function runRemove(
  job: Extract<MediaJob, { kind: "remove" }>,
): Promise<JobOutcome> {
  if (job.storagePaths.length === 0) return "done";
  // Att ta bort ett objekt som inte finns är en no-op i Storage, så
  // jobbet tål omförsök och tål att köas "för säkerhets skull".
  const { error } = await supabase.storage
    .from(WORKOUT_MEDIA_BUCKET)
    .remove(job.storagePaths);
  if (!error) return "done";

  // Ingen dialog vad som än händer. Det som misslyckats är städning av
  // filer som ingen rad längre pekar på - användaren har inte förlorat
  // något och kan inte göra något åt det.
  const status = (error as { status?: unknown }).status;
  if (typeof status === "number" && classifyStatus(status) === "permanent") {
    return "failed";
  }
  // Räknas ALLTID upp, till skillnad från uppladdningen. Där är
  // omförsöket gratis eftersom jobbet ändå bara ligger och väntar; här
  // står det i vägen för uppladdningar, så tålamodet måste ta slut.
  job.attempts += 1;
  return job.attempts >= MAX_AMBIGUOUS_ATTEMPTS ? "failed" : "retry";
}

export async function flushMediaQueue(): Promise<void> {
  if (running) return;
  // Samma resonemang som i synk-kön: utan nät väntar varje försök bara
  // ut en timeout. onReconnect nedan kör igen när uppkopplingen är
  // tillbaka.
  if (!getOnlineStatus()) return;
  running = true;
  try {
    await ensureLoaded();
    while (state.jobs.length > 0) {
      // Hämtas per varv, inte en gång: getSession() förnyar ett token
      // som håller på att gå ut, och en kö med videor kan ta längre tid
      // än ett tokens livslängd.
      const { data } = await supabase.auth.getSession();
      const session = data.session;
      // Utloggad. Inget att göra, och ingenting som ska förbruka ett
      // försök - nästa flush möter ett annat läge.
      if (!session) return;

      // Första jobbet som hör till den som är inloggad NU. Till skillnad
      // från synk-kön går det bra att hoppa över: mediajobb har inga
      // ordningsberoenden sinsemellan - varje uppladdning står för sig
      // själv, och beroendet till passets rad hanteras av att "add_media"
      // läggs i den ANDRA kön efteråt.
      const index = state.jobs.findIndex(
        (candidate) => candidate.userId === session.user.id,
      );
      // Bara jobb för någon annan användare kvar. De ligger kvar tills
      // den användaren loggar in igen.
      if (index === -1) return;

      const job = state.jobs[index]!;
      const outcome =
        job.kind === "upload"
          ? await runUpload(job, session.access_token)
          : await runRemove(job);

      if (outcome === "retry") {
        // Jobbet ligger kvar på sin plats och tas om vid nästa flush.
        // Både runUpload och runRemove kan ha räknat upp `attempts`, så
        // tillståndet måste ned på disk innan vi lämnar.
        await persist();
        return;
      }

      if (outcome === "failed" && job.kind === "upload") {
        // Den lokala filen behålls: den är enda exemplaret av
        // användarens bild. sweepOrphanedMedia frågar efter failed-listan
        // och låter den vara.
        state.failed.push(job);
      }

      if (job.kind === "upload") {
        state.cancelled = state.cancelled.filter((id) => id !== job.mediaId);
      }
      state.jobs.splice(index, 1);
      await persist();
    }
  } finally {
    running = false;
  }
}

export async function enqueueUpload(
  job: Omit<Extract<MediaJob, { kind: "upload" }>, "kind" | "attempts">,
): Promise<void> {
  await ensureLoaded();
  state.jobs.push({ ...job, kind: "upload", attempts: 0 });
  await persist();
  void flushMediaQueue();
}

export async function enqueueRemove(
  userId: string,
  storagePaths: string[],
): Promise<void> {
  if (storagePaths.length === 0) return;
  await ensureLoaded();
  state.jobs.push({ kind: "remove", userId, storagePaths, attempts: 0 });
  await persist();
  void flushMediaQueue();
}

// Ångrar en uppladdning som ännu inte hunnit bli en rad.
//
// Ordningen är noga vald. `cancelled` skrivs FÖRST, eftersom det är den
// enda spärr som hindrar en uppladdning som redan är klar - men vars rad
// inte hunnit köas - från att skriva raden ändå.
//
// Det stänger inte fönstret helt: hinner runUpload passera sin
// cancelled-kontroll i samma ögonblick köas "add_media". Därför köar
// anroparen (removeWorkoutMedia i queries.ts) ALLTID även en
// "delete_media" i synk-kön. Den är FIFO, så den hamnar bakom
// "add_media" och nettoresultatet blir rätt oavsett vem som vann.
export async function cancelUpload(mediaId: string): Promise<void> {
  await ensureLoaded();
  const job = state.jobs.find(
    (candidate) => candidate.kind === "upload" && candidate.mediaId === mediaId,
  );
  if (!job || job.kind !== "upload") return;

  if (!state.cancelled.includes(mediaId)) state.cancelled.push(mediaId);
  state.jobs = state.jobs.filter((candidate) => candidate !== job);
  state.failed = state.failed.filter(
    (candidate) => candidate.kind !== "upload" || candidate.mediaId !== mediaId,
  );
  await persist();

  if (inFlight?.mediaId === mediaId) inFlight.controller.abort();
  deleteLocalMedia(job.localUri);
}

// Sant när ingenting väntar på att laddas upp. Redigeringsskärmen kräver
// det av samma skäl som den kräver en tömd synk-kö: den läser passets
// media från servern, och media som ännu inte kommit dit hade sett ut
// som borttagen - och blivit borttagen om användaren sparade.
//
// Till skillnad från drainQueue() i offline-queue.ts väntar den här INTE
// in tömningen. Åtgärderna där är små uppdateringar som är över på
// millisekunder; här kan huvudet i kön vara en video på tjugo megabyte,
// och att blockera skärmen på den hade sett ut som att appen hängt sig.
// Uppladdningen knuffas i gång och svaret gäller läget just nu - "försök
// igen om en stund" är ett ärligare besked än en frusen skärm.
export async function isMediaQueueDrained(): Promise<boolean> {
  await ensureLoaded();
  void flushMediaQueue();
  return pendingIds().length === 0;
}

export async function getPendingMediaIds(): Promise<string[]> {
  await ensureLoaded();
  return pendingIds();
}

export function subscribeToPendingMediaIds(
  listener: (mediaIds: string[]) => void,
): () => void {
  pendingListeners.add(listener);
  getPendingMediaIds().then(listener);
  return () => {
    pendingListeners.delete(listener);
  };
}

export function subscribeToMediaErrors(
  listener: (message: string) => void,
): () => void {
  errorListeners.add(listener);
  return () => {
    errorListeners.delete(listener);
  };
}

// Städar lokala filer som ingen längre håller reda på - se
// sweepOrphanedMedia i media-store.ts. Körs vid appstart, när kön just
// lästs in och alltså vet exakt vilka filer som fortfarande behövs.
async function sweep(): Promise<void> {
  await ensureLoaded();
  const keep = new Set<string>();
  for (const job of [...state.jobs, ...state.failed]) {
    if (job.kind === "upload") keep.add(job.mediaId);
  }
  sweepOrphanedMedia(keep);
}

// Samma mönster som synk-kön: försök direkt vid appstart och varje gång
// uppkopplingen kommer tillbaka.
void sweep().then(() => flushMediaQueue());
onReconnect(() => void flushMediaQueue());
