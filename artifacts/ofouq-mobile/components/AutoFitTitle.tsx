import React, { useEffect, useState } from "react";
import {
  type NativeSyntheticEvent,
  StyleProp,
  StyleSheet,
  Text,
  type TextLayoutEventData,
  type TextProps,
  TextStyle,
  View,
} from "react-native";

type Props = Omit<TextProps, "children" | "style" | "numberOfLines"> & {
  children: string;
  style?: StyleProp<TextStyle>;
  /** The largest (preferred) font size. The text never grows past this. */
  maxFontSize: number;
  /** The smallest font size it may shrink to before it ellipsizes. */
  minFontSize?: number;
  /** Hard cap on line count. */
  maxLines?: number;
  /** lineHeight = round(fontSize * lineHeightRatio). Keep tight for headings. */
  lineHeightRatio?: number;
};

/**
 * A header title that keeps long, admin-entered names on at most `maxLines`
 * lines by shrinking the font to fit.
 *
 * It renders TWO copies: an off-layout, invisible "measurer" (no line cap) that
 * reports the real line count at the current size, and the VISIBLE copy that is
 * always shown and hard-capped at `maxLines`. So the text can never disappear
 * (a known failure mode of hiding-while-measuring) and never overflows
 * unbounded — worst case it truncates with an ellipsis. We set fontSize AND a
 * tight lineHeight together so vertical rhythm stays correct as it shrinks.
 */
export function AutoFitTitle({
  children,
  style,
  maxFontSize,
  minFontSize = 18,
  maxLines = 2,
  lineHeightRatio = 1.18,
  ...rest
}: Props) {
  const [fontSize, setFontSize] = useState(maxFontSize);

  // Restart from the top whenever the text or constraints change.
  useEffect(() => {
    setFontSize(maxFontSize);
  }, [children, maxFontSize, maxLines]);

  const onMeasure = (event: NativeSyntheticEvent<TextLayoutEventData>) => {
    const count = event.nativeEvent.lines.length;
    if (count > maxLines) {
      setFontSize((current) =>
        current > minFontSize
          ? Math.max(minFontSize, Math.floor(current - Math.max(1, current * 0.08)))
          : current,
      );
    }
  };

  const sizeStyle = { fontSize, lineHeight: Math.round(fontSize * lineHeightRatio) };

  return (
    <View style={styles.wrap}>
      <Text
        style={[style, sizeStyle, styles.measurer]}
        onTextLayout={onMeasure}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {children}
      </Text>
      <Text {...rest} numberOfLines={maxLines} style={[style, sizeStyle]}>
        {children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: "100%" },
  measurer: { position: "absolute", top: 0, left: 0, right: 0, opacity: 0 },
});
