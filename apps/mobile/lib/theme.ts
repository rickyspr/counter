import type { ViewStyle } from "react-native";

// Design tokens for the "RepCount Premium Redesign" (Claude Design,
// "Djup terrakotta" accent). Only styling lives here - colours, radii,
// spacing and shadows. Colours are the sRGB conversions of the canvas's
// oklch values; the design's gradients collapse to a single solid here,
// since React Native has no gradient primitive in this app.
//
// Nothing in this file touches behaviour, state or data access.

export const colors = {
  // Surfaces
  background: "#f4efeb", // warm off-white app background
  surface: "#ffffff", // cards, sheets
  surfaceMuted: "#faf5f0", // subtly warm card / panel fill
  surfaceSunken: "#f4ede8", // inputs, steppers, inset rows
  neutralFill: "#e7e1db", // avatars, media placeholders, icon chips

  // Text
  ink: "#2a221e", // headings
  inkSecondary: "#3d332d", // strong body text
  textMuted: "#78706b", // secondary text, labels
  textFaint: "#8c8480", // captions, placeholders, hints

  // Lines
  border: "#e7e0da",
  divider: "#efeae6",

  // Accent - terracotta
  accent: "#c06c4f",
  accentDeep: "#89442f",
  accentTint: "#fae2d8",
  accentGhost: "#fdf1ea",
  onAccent: "#ffffff",

  // Semantic (kept close to the originals, nudged warm)
  danger: "#b23b2b",
  kudos: "#b06a2f",

  white: "#ffffff",
  black: "#000000",
} as const;

export const radii = {
  sm: 14, // inputs, small controls, tiles
  md: 18, // chips, list icons
  lg: 24, // cards, buttons
  xl: 30, // hero cards
  pill: 999,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
} as const;

// iOS reads shadow*, Android reads elevation - both set so cards lift on
// either platform.
export const shadows = {
  card: {
    shadowColor: "#3a2c25",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 3,
  },
  raised: {
    shadowColor: "#3a2c25",
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.14,
    shadowRadius: 28,
    elevation: 6,
  },
  accentButton: {
    shadowColor: "#89442f",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.3,
    shadowRadius: 18,
    elevation: 5,
  },
} satisfies Record<string, ViewStyle>;
