import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useRef, useState } from "react";
import { Animated } from "react-native";

/**
 * Streak-up celebration, shared between the home strip and the Points & Streak
 * screen. The +1 celebration must fire AT MOST ONCE PER DAY, on whichever card is
 * shown first — never twice. We coordinate that here:
 *   - `gam_last_streak` (AsyncStorage) persists the last streak we celebrated, so a
 *     new day's increment fires once and never again after a restart.
 *   - a module-level in-memory guard + a serialized chain make concurrent calls
 *     from both mounted screens hand off cleanly (the first wins, the rest no-op).
 */
const LAST_STREAK_KEY = "gam_last_streak";
let sessionShownFor: number | null = null; // highest streak already handled this session
let chain: Promise<unknown> = Promise.resolve();

/**
 * Decide whether to play the streak celebration for `cur`. Returns the value to
 * animate FROM (the old streak) if a celebration should play now, else null.
 * Serialized so two screens can't both celebrate the same increment.
 */
export function shouldCelebrateStreak(cur: number): Promise<number | null> {
  const result = chain.then(async () => {
    if (sessionShownFor != null && sessionShownFor >= cur) return null;
    const stored = await AsyncStorage.getItem(LAST_STREAK_KEY).catch(() => null);
    const prev = stored != null ? Number(stored) : null;
    await AsyncStorage.setItem(LAST_STREAK_KEY, String(cur)).catch(() => undefined);
    sessionShownFor = sessionShownFor == null ? cur : Math.max(sessionShownFor, cur);
    return prev != null && cur > prev ? prev : null;
  });
  chain = result.catch(() => undefined);
  return result;
}

export interface StreakCelebration {
  celebrating: boolean;
  displayStreak: number;
  fireAnim: Animated.Value; // 0 normal → 1 full blaze (drives the backdrop + number)
  revealAnim: Animated.Value; // 0 during blaze → 1 (side content slides back)
  playCelebration: (from: number, to: number) => void;
}

/**
 * Drives one card's streak celebration. Auto-fires once/day (shared via
 * shouldCelebrateStreak) when `streak` first appears increased; `onRevealDone`
 * runs after the blaze settles (e.g. to play the flame icon for 2s).
 */
export function useStreakCelebration(streak: number | undefined, opts?: { onRevealDone?: () => void }): StreakCelebration {
  const [celebrating, setCelebrating] = useState(false);
  const [displayStreak, setDisplayStreak] = useState(0);
  const fireAnim = useRef(new Animated.Value(0)).current;
  const revealAnim = useRef(new Animated.Value(1)).current;
  const onRevealDone = useRef(opts?.onRevealDone);
  onRevealDone.current = opts?.onRevealDone;
  const celebratingRef = useRef(false);
  celebratingRef.current = celebrating;

  const playCelebration = useCallback(
    (from: number, to: number) => {
      setDisplayStreak(from);
      setCelebrating(true);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      fireAnim.setValue(0);
      revealAnim.setValue(0);
      const countV = new Animated.Value(0);
      countV.addListener(({ value }) => setDisplayStreak(Math.round(from + (to - from) * value)));
      Animated.sequence([
        Animated.timing(fireAnim, { toValue: 1, duration: 300, useNativeDriver: true }), // blaze in
        Animated.parallel([
          Animated.timing(countV, { toValue: 1, duration: 1000, useNativeDriver: false }), // ticks +1 over ~1s
          Animated.delay(1700), // hold ~2s total
        ]),
        Animated.timing(fireAnim, { toValue: 0, duration: 300, useNativeDriver: true }), // blaze out
      ]).start(() => {
        countV.removeAllListeners();
        setDisplayStreak(to);
        Animated.timing(revealAnim, { toValue: 1, duration: 480, useNativeDriver: true }).start(() => {
          setCelebrating(false);
          onRevealDone.current?.();
        });
      });
    },
    [fireAnim, revealAnim],
  );

  // Auto-detect a day increase, once/day, shared across both cards.
  useEffect(() => {
    if (streak == null) return;
    let cancelled = false;
    shouldCelebrateStreak(streak).then((from) => {
      if (!cancelled && from != null && !celebratingRef.current) playCelebration(from, streak);
    });
    return () => {
      cancelled = true;
    };
  }, [streak, playCelebration]);

  return { celebrating, displayStreak, fireAnim, revealAnim, playCelebration };
}
