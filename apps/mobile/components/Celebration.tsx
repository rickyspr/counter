import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  runOnJS,
  type SharedValue,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { colors } from "../lib/theme";

interface Props {
  praise: string;
  // Slår igenom i en extra guldfärgad partikelvåg + kraftigare haptik.
  beatPrevious: boolean;
  // Kallas exakt en gång: när hjälten spelat klart, eller när användaren
  // trycker för att hoppa över den. Skärmen avtäcker då överblicken.
  onDone: () => void;
}

// Hur länge hjälten ligger kvar innan overlayen tonar bort.
const HERO_MS = 1650;

const PARTICLE_COUNT = 56;
const BASE_COLORS = [
  colors.accent,
  colors.accentDeep,
  "#e8a05f", // ljusare terrakotta
  "#f2c94c", // varm guld
  colors.white,
];
const RECORD_COLORS = ["#f2c94c", "#e8a33d", "#ffe08a", colors.white];

interface Particle {
  angle: number;
  distance: number;
  size: number;
  color: string;
  round: boolean;
  spin: number;
  gravity: number;
  lead: number;
}

// Billig deterministisk "slump" per index - bara för spridning.
function rand(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function buildParticles(beatPrevious: boolean): Particle[] {
  const palette = beatPrevious ? [...BASE_COLORS, ...RECORD_COLORS] : BASE_COLORS;
  return Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
    angle: (i / PARTICLE_COUNT) * Math.PI * 2 + (rand(i * 3.3) - 0.5) * 0.5,
    distance: 90 + rand(i * 7.7) * 190,
    size: 6 + rand(i * 5.1) * 9,
    color: palette[i % palette.length] ?? colors.accent,
    round: rand(i * 2.9) > 0.55,
    spin: (rand(i * 9.4) - 0.5) * 1440,
    gravity: 30 + rand(i * 4.2) * 70,
    lead: rand(i * 6.6) * 0.16,
  }));
}

function Burst({
  particle,
  progress,
  cx,
  cy,
}: {
  particle: Particle;
  progress: SharedValue<number>;
  cx: number;
  cy: number;
}) {
  const style = useAnimatedStyle(() => {
    const span = 1 - particle.lead;
    const raw = (progress.value - particle.lead) / span;
    const t = raw < 0 ? 0 : raw > 1 ? 1 : raw;
    const ease = 1 - Math.pow(1 - t, 3);
    const x = Math.cos(particle.angle) * particle.distance * ease;
    const y =
      Math.sin(particle.angle) * particle.distance * ease +
      particle.gravity * t * t;
    const fadeIn = t < 0.12 ? t / 0.12 : 1;
    const fadeOut = t > 0.55 ? 1 - Math.pow((t - 0.55) / 0.45, 2) : 1;
    return {
      opacity: fadeIn * (fadeOut < 0 ? 0 : fadeOut),
      transform: [
        { translateX: x },
        { translateY: y },
        { rotate: `${particle.spin * ease}deg` },
        { scale: 0.5 + 0.5 * Math.min(1, t * 4) },
      ],
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: "absolute",
          left: cx - particle.size / 2,
          top: cy - particle.size / 2,
          width: particle.size,
          height: particle.round ? particle.size : particle.size * 0.55,
          borderRadius: particle.round ? particle.size / 2 : 2,
          backgroundColor: particle.color,
        },
        style,
      ]}
    />
  );
}

function Ring({ v, color }: { v: SharedValue<number>; color: string }) {
  const style = useAnimatedStyle(() => ({
    opacity: (1 - v.value) * 0.55,
    transform: [{ scale: 0.4 + v.value * 2.4 }],
  }));
  return <Animated.View style={[styles.ring, { borderColor: color }, style]} />;
}

// Duolingo-inspirerat firande (inte en kopia): studsig bricka, ringpuls,
// radiell partikelsvärm och en peppmening - allt i RepCounts terrakotta.
// Byggt på react-native-reanimated (kräver New Architecture, standard i
// SDK 57). Overlayen täcker överblicken bakom sig tills den tonat ut.
export function Celebration({ praise, beatPrevious, onDone }: Props) {
  const { width, height } = useWindowDimensions();
  const cx = width / 2;
  const cy = height * 0.42;
  const reduceMotion = useReducedMotion();

  const particles = useMemo(() => buildParticles(beatPrevious), [beatPrevious]);

  const badge = useSharedValue(0);
  const wobble = useSharedValue(0);
  const ring1 = useSharedValue(0);
  const ring2 = useSharedValue(0);
  const ring3 = useSharedValue(0);
  const burst = useSharedValue(0);
  const praiseIn = useSharedValue(0);
  const overlay = useSharedValue(1);

  const doneRef = useRef(false);
  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone();
  }, [onDone]);

  useEffect(() => {
    const fadeOut = (duration: number, delay: number) => {
      overlay.value = withDelay(
        delay,
        withTiming(0, { duration }, (fin) => {
          if (fin) runOnJS(finish)();
        }),
      );
    };

    if (reduceMotion) {
      badge.value = 1;
      ring1.value = 1;
      ring2.value = 1;
      ring3.value = 1;
      burst.value = 1;
      praiseIn.value = 1;
      fadeOut(220, 900);
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
      () => {},
    );

    badge.value = withSpring(1, { damping: 8, stiffness: 150, mass: 0.7 });
    wobble.value = withSequence(
      withTiming(-0.14, { duration: 90 }),
      withSpring(0, { damping: 6, stiffness: 180 }),
    );
    ring1.value = withTiming(1, { duration: 560, easing: Easing.out(Easing.cubic) });
    ring2.value = withDelay(
      90,
      withTiming(1, { duration: 620, easing: Easing.out(Easing.cubic) }),
    );
    ring3.value = withDelay(
      180,
      withTiming(1, { duration: 680, easing: Easing.out(Easing.cubic) }),
    );
    burst.value = withTiming(1, {
      duration: 1050,
      easing: Easing.out(Easing.quad),
    });
    praiseIn.value = withDelay(340, withSpring(1, { damping: 12, stiffness: 140 }));

    let recordTimer: ReturnType<typeof setTimeout> | undefined;
    if (beatPrevious) {
      recordTimer = setTimeout(() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
      }, 720);
    }

    fadeOut(320, HERO_MS);
    return () => {
      if (recordTimer) clearTimeout(recordTimer);
    };
    // Körs EN gång vid mount. reduceMotion/beatPrevious är konstanta för
    // firandets livstid, och shared values + finish är stabila refs -
    // att lista dem skulle bara riskera att starta om sekvensen.
  }, []);

  const skip = useCallback(() => {
    cancelAnimation(overlay);
    overlay.value = withTiming(0, { duration: 140 }, (fin) => {
      if (fin) runOnJS(finish)();
    });
  }, [finish, overlay]);

  const overlayStyle = useAnimatedStyle(() => ({ opacity: overlay.value }));
  const badgeStyle = useAnimatedStyle(() => ({
    transform: [{ scale: badge.value }, { rotate: `${wobble.value}rad` }],
  }));
  const glowStyle = useAnimatedStyle(() => ({
    opacity: 0.5 * badge.value,
    transform: [{ scale: 0.6 + badge.value * 0.7 }],
  }));
  const praiseStyle = useAnimatedStyle(() => ({
    opacity: praiseIn.value,
    transform: [{ translateY: (1 - praiseIn.value) * 16 }],
  }));

  return (
    <Animated.View style={[styles.overlay, overlayStyle]}>
      <Pressable style={StyleSheet.absoluteFill} onPress={skip}>
        <View style={[styles.hero, { top: cy }]}>
          <Animated.View style={[styles.glow, glowStyle]} />
          <Ring v={ring1} color={colors.accent} />
          <Ring v={ring2} color={colors.kudos} />
          <Ring v={ring3} color={colors.accent} />
          <Animated.View style={[styles.badge, badgeStyle]}>
            <Text style={styles.check}>✓</Text>
          </Animated.View>
        </View>

        <Animated.Text style={[styles.praise, { top: cy + 130 }, praiseStyle]}>
          {praise}
        </Animated.Text>

        {particles.map((particle, i) => (
          <Burst key={i} particle={particle} progress={burst} cx={cx} cy={cy} />
        ))}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.background,
    zIndex: 10,
  },
  hero: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  glow: {
    position: "absolute",
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: colors.accentTint,
  },
  ring: {
    position: "absolute",
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 3,
  },
  badge: {
    width: 112,
    height: 112,
    borderRadius: 30,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  check: {
    color: colors.onAccent,
    fontSize: 60,
    fontWeight: "900",
    lineHeight: 66,
  },
  praise: {
    position: "absolute",
    left: 24,
    right: 24,
    textAlign: "center",
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: -0.4,
    color: colors.ink,
  },
});
