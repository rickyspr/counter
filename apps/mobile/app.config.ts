import path from "node:path";
import { config as loadEnv } from "dotenv";
import type { ConfigContext, ExpoConfig } from "expo/config";

// Counter har en enda .env i repo-roten (se CLAUDE.md), ingen separat
// kopia per app.
loadEnv({ path: path.resolve(__dirname, "../../.env") });

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "Counter",
  slug: "mobile",
  scheme: "counter",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/counter_icon.png",
  userInterfaceStyle: "light",
  ios: {
  supportsTablet: true,
  bundleIdentifier: "com.counter.mobile",
  icon: "./assets/counter_icon.png",
},
  android: {
    adaptiveIcon: {
      backgroundColor: "#E6F4FE",
      foregroundImage: "./assets/counter_icon.png",
      backgroundImage: "./assets/counter_icon.png",
      monochromeImage: "./assets/counter_icon.png",
    },
    predictiveBackGestureEnabled: false,
  },
  web: {
    favicon: "./assets/counter_icon.png",
  },
  plugins: [
    "expo-web-browser",
    "expo-localization",
    "@react-native-community/datetimepicker",
    // Behörighetstexterna är det användaren faktiskt läser i iOS-dialogen,
    // alltså UI-språk: svenska (se CLAUDE.md). $(PRODUCT_NAME) fylls i av
    // Expo med appens namn.
    [
      "expo-image-picker",
      {
        photosPermission:
          "Counter behöver komma åt dina bilder för att du ska kunna lägga till dem i ett pass.",
        cameraPermission:
          "Counter behöver komma åt kameran för att du ska kunna fota eller filma under ett pass.",
        microphonePermission:
          "Counter behöver komma åt mikrofonen när du spelar in video under ett pass.",
      },
    ],
    "expo-video",
  ],
  extra: {
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
  },
});
