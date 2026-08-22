import {
  MAX_VIDEO_DURATION_SECONDS,
  MEDIA_IMAGE_QUALITY,
} from "@repcount/shared";
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
      ? "RepCount behöver tillgång till dina bilder. Du kan ge det under Inställningar."
      : "RepCount behöver tillgång till kameran. Du kan ge det under Inställningar.",
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
      // gräns - se MAX_VIDEO_DURATION_SECONDS i @repcount/shared.
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
