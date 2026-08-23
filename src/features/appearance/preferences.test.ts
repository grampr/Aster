import { describe, expect, it } from "vitest";
import {
  defaultAppearancePreferences,
  loadAppearancePreferences,
  normalizeAppearancePreferences,
  saveAppearancePreferences,
} from "./preferences";

function memoryStorage(initial: string | null = null) {
  let value = initial;
  return {
    getItem: () => value,
    setItem: (_key: string, next: string) => { value = next; },
    value: () => value,
  };
}

describe("appearance preferences", () => {
  it("clamps persisted sizing values to the supported layout range", () => {
    expect(normalizeAppearancePreferences({
      density: "comfortable",
      accent: "#24b47e",
      membersVisible: false,
      channelWidth: 999,
      memberWidth: 10,
      fontSizeDelta: 20,
      iconSizePercent: 113,
      fontFamily: "serif",
    })).toEqual({
      density: "comfortable",
      accent: "#24b47e",
      membersVisible: false,
      channelWidth: 380,
      memberWidth: 220,
      fontSizeDelta: 3,
      iconSizePercent: 115,
      fontFamily: "serif",
    });
  });

  it("falls back to the system font for an unsupported persisted font", () => {
    expect(normalizeAppearancePreferences({ fontFamily: "remote-font" }).fontFamily).toBe("system");
  });

  it("falls back to defaults when persisted JSON is invalid", () => {
    expect(loadAppearancePreferences(memoryStorage("not-json"))).toEqual(defaultAppearancePreferences);
  });

  it("round-trips normalized preferences through storage", () => {
    const storage = memoryStorage();
    const preferences = { ...defaultAppearancePreferences, fontSizeDelta: 2, iconSizePercent: 120, fontFamily: "rounded" as const };

    saveAppearancePreferences(preferences, storage);

    expect(loadAppearancePreferences(storage)).toEqual(preferences);
    expect(storage.value()).toContain('"iconSizePercent":120');
    expect(storage.value()).toContain('"fontFamily":"rounded"');
  });
});
