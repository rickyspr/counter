import path from "node:path";
import { config as loadEnv } from "dotenv";
import type { ConfigContext, ExpoConfig } from "expo/config";

// RepCount har en enda .env i repo-roten (se CLAUDE.md), ingen separat
// kopia per app.
loadEnv({ path: path.resolve(__dirname, "../../.env") });

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "mobile",
  slug: "mobile",
  scheme: "repcount",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "light",
  ios: {
    supportsTablet: true,
    bundleIdentifier: "com.repcount.mobile",
  },
  android: {
    adaptiveIcon: {
      backgroundColor: "#E6F4FE",
      foregroundImage: "./assets/android-icon-foreground.png",
      backgroundImage: "./assets/android-icon-background.png",
      monochromeImage: "./assets/android-icon-monochrome.png",
    },
    predictiveBackGestureEnabled: false,
  },
  web: {
    favicon: "./assets/favicon.png",
  },
  plugins: [
    "expo-web-browser",
    "@react-native-community/datetimepicker",
    // Behörighetstexterna är det användaren faktiskt läser i iOS-dialogen,
    // alltså UI-språk: svenska (se CLAUDE.md). $(PRODUCT_NAME) fylls i av
    // Expo med appens namn.
    [
      "expo-image-picker",
      {
        photosPermission:
          "RepCount behöver komma åt dina bilder för att du ska kunna lägga till dem i ett pass.",
        cameraPermission:
          "RepCount behöver komma åt kameran för att du ska kunna fota eller filma under ett pass.",
        microphonePermission:
          "RepCount behöver komma åt mikrofonen när du spelar in video under ett pass.",
      },
    ],
    "expo-video",
  ],
  extra: {
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
  },
});
