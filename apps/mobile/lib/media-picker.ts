import {
  AVATAR_IMAGE_QUALITY,
  AVATAR_MAX_BYTES,
  avatarExtensionForMimeType,
  MAX_VIDEO_DURATION_SECONDS,
  MEDIA_IMAGE_QUALITY,
  mimeTypeForExtension,
} from "@counter/shared";
import { File } from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import { Alert } from "react-native";
import { importPickedAsset, type ImportedMedia } from "./media-store";

// Väljaren: dialogen, behörigheterna och kompressionen på ett ställe, så
// att pass-skärmen och redigeringsskärmen inte behöver upprepa något av
// det.

type Source = "camera-photo" | "camera-video" | "library";

// Alert.alert är callback-baserad. Inslagen i ett löfte blir hela flödet
// ett enda await i anropande skärm.
function askForSource(): Promise<Source | null> {
  return new Promise((resolve) => {
    Alert.alert(
      "Lägg till media",
      undefined,
      [
        { text: "Ta foto", onPress: () => resolve("camera-photo") },
        { text: "Spela in video", onPress: () => resolve("camera-video") },
        { text: "Välj från galleriet", onPress: () => resolve("library") },
        // onDismiss täcker inte Android-bakåtknappen, så avbrytet ligger
        // i knappen: utan det hade löftet aldrig lösts och anroparen
        // väntat för evigt.
        { text: "Avbryt", style: "cancel", onPress: () => resolve(null) },
      ],
      { cancelable: true, onDismiss: () => resolve(null) },
    );
  });
}

async function ensurePermission(source: Source): Promise<boolean> {
  const { granted } =
    source === "library"
      ? await ImagePicker.requestMediaLibraryPermissionsAsync()
      : await ImagePicker.requestCameraPermissionsAsync();
  if (granted) return true;

  Alert.alert(
    "Behörighet saknas",
    source === "library"
      ? "Counter behöver tillgång till dina bilder. Du kan ge det under Inställningar."
      : "Counter behöver tillgång till kameran. Du kan ge det under Inställningar.",
  );
  return false;
}

function launch(source: Source): Promise<ImagePicker.ImagePickerResult> {
  if (source === "camera-photo") {
    return ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: MEDIA_IMAGE_QUALITY,
    });
  }
  if (source === "camera-video") {
    return ImagePicker.launchCameraAsync({
      mediaTypes: ["videos"],
      // Taket som gör att filstorleken går att hålla under bucketens
      // gräns - se MAX_VIDEO_DURATION_SECONDS i @counter/shared.
      videoMaxDuration: MAX_VIDEO_DURATION_SECONDS,
      videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium,
    });
  }
  // Ur galleriet. videoMaxDuration gäller BARA inspelning, så en redan
  // filmad video kan vara hur lång som helst - den fångas istället av
  // storlekskontrollen i importPickedAsset, som säger ifrån direkt
  // istället för att låta uppladdningen misslyckas tyst senare.
  return ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images", "videos"],
    quality: MEDIA_IMAGE_QUALITY,
  });
}

// Svarar med null när användaren avbrutit eller nekat behörighet - båda
// är normala utfall, inte fel. Riktiga fel (filtypen stöds inte, filen
// är för stor) visas som dialog här och ger också null, eftersom
// anroparen inte har något vettigt att lägga till.
export async function pickWorkoutMedia(): Promise<ImportedMedia | null> {
  const source = await askForSource();
  if (source === null) return null;
  if (!(await ensurePermission(source))) return null;

  let result: ImagePicker.ImagePickerResult;
  try {
    result = await launch(source);
  } catch (err) {
    Alert.alert(
      "Kunde inte öppna kameran",
      err instanceof Error ? err.message : "Okänt fel.",
    );
    return null;
  }

  const asset = result.canceled ? null : result.assets[0];
  if (!asset) return null;

  try {
    // Kopierar filen till appens egen katalog. Det är först här den blir
    // vår - ImagePickers URI pekar in i cachen, som systemet får städa.
    return await importPickedAsset(asset);
  } catch (err) {
    Alert.alert(
      "Kunde inte lägga till filen",
      err instanceof Error ? err.message : "Okänt fel.",
    );
    return null;
  }
}

// A profile picture, which is a different job from workout media: one
// square image, no video, and no copy into the app's own directory.
//
// Skipping importPickedAsset is deliberate. That copy exists because a
// workout can sit unsynced for days and the picker's cache URI will not
// survive that. An avatar is uploaded moments later from the settings
// screen, which requires a connection anyway - and a file parked in the
// workout-media directory would be deleted by sweepOrphanedMedia on the
// next app start, since the upload queue knows nothing about it.
export interface PickedProfileImage {
  localUri: string;
  mimeType: string;
  extension: string;
}

function askForProfileImageSource(): Promise<Source | null> {
  return new Promise((resolve) => {
    Alert.alert(
      "Profilbild",
      undefined,
      [
        { text: "Ta foto", onPress: () => resolve("camera-photo") },
        { text: "Välj från galleriet", onPress: () => resolve("library") },
        { text: "Avbryt", style: "cancel", onPress: () => resolve(null) },
      ],
      { cancelable: true, onDismiss: () => resolve(null) },
    );
  });
}

export async function pickProfileImage(): Promise<PickedProfileImage | null> {
  const source = await askForProfileImageSource();
  if (source === null) return null;
  if (!(await ensurePermission(source))) return null;

  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ["images"],
    quality: AVATAR_IMAGE_QUALITY,
    // The crop UI. `aspect` is Android-only per the SDK 57 docs; iOS's
    // built-in editor is square already, which is what an avatar needs.
    allowsEditing: true,
    aspect: [1, 1],
  };

  let result: ImagePicker.ImagePickerResult;
  try {
    result =
      source === "camera-photo"
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);
  } catch (err) {
    Alert.alert(
      "Kunde inte öppna kameran",
      err instanceof Error ? err.message : "Okänt fel.",
    );
    return null;
  }

  const asset = result.canceled ? null : result.assets[0];
  if (!asset) return null;

  const file = new File(asset.uri);
  // ImagePicker leaves mimeType null often enough on Android that the
  // file extension has to be able to stand in for it.
  const fromPicker = asset.mimeType ?? null;
  const mimeType = avatarExtensionForMimeType(fromPicker)
    ? fromPicker
    : mimeTypeForExtension(file.extension);
  const extension = avatarExtensionForMimeType(mimeType);
  if (!mimeType || !extension) {
    // Unlike workout media, an unknown type is NOT guessed at here.
    // There the guess is only a label on a file the user has already
    // committed to a workout; an avatar is one picture that is easy to
    // pick again, and a mislabelled one would be stored under a wrong
    // extension forever.
    Alert.alert(
      "Filtypen stöds inte",
      "Välj en bild i JPEG-, PNG- eller HEIC-format.",
    );
    return null;
  }

  // Checked here rather than at upload time: the bucket answers an
  // oversized file with a 4xx, and "Kunde inte spara" is a worse
  // sentence than telling the user which file was too big.
  if (file.size > AVATAR_MAX_BYTES) {
    const limitMb = Math.round(AVATAR_MAX_BYTES / (1024 * 1024));
    Alert.alert("Bilden är för stor", `Max ${limitMb} MB.`);
    return null;
  }

  return { localUri: asset.uri, mimeType, extension };
}
