export type Density = "compact" | "comfortable";
export type FontFamily = "system" | "gothic" | "rounded" | "serif";

export type AppearancePreferences = {
  density: Density;
  accent: string;
  membersVisible: boolean;
  channelWidth: number;
  memberWidth: number;
  fontSizeDelta: number;
  iconSizePercent: number;
  fontFamily: FontFamily;
};

export const accentOptions = ["#1687f8", "#24b47e", "#7557e8", "#ff8a34", "#ec3e78", "#7c8798"] as const;

export const fontOptions: ReadonlyArray<{ value: FontFamily; label: string; css: string }> = [
  {
    value: "system",
    label: "システム標準",
    css: 'Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans JP", sans-serif',
  },
  {
    value: "gothic",
    label: "ゴシック",
    css: '"Hiragino Kaku Gothic ProN", "Yu Gothic", Meiryo, sans-serif',
  },
  {
    value: "rounded",
    label: "丸ゴシック",
    css: '"Hiragino Maru Gothic ProN", "Yu Gothic", Meiryo, sans-serif',
  },
  {
    value: "serif",
    label: "明朝",
    css: '"Hiragino Mincho ProN", "Yu Mincho", serif',
  },
];

export const defaultAppearancePreferences: AppearancePreferences = {
  density: "compact",
  accent: accentOptions[0],
  membersVisible: true,
  channelWidth: 330,
  memberWidth: 286,
  fontSizeDelta: 0,
  iconSizePercent: 100,
  fontFamily: "system",
};

const storageKey = "aster.appearance.v1";

type AppearanceStorage = Pick<Storage, "getItem" | "setItem">;

function availableStorage(): AppearanceStorage | null {
  return typeof globalThis.localStorage === "undefined" ? null : globalThis.localStorage;
}

function clampedNumber(value: unknown, fallback: number, minimum: number, maximum: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, value));
}

export function normalizeAppearancePreferences(value: unknown): AppearancePreferences {
  if (!value || typeof value !== "object") return { ...defaultAppearancePreferences };
  const candidate = value as Partial<AppearancePreferences>;
  return {
    density: candidate.density === "comfortable" ? "comfortable" : "compact",
    accent: typeof candidate.accent === "string" && accentOptions.includes(candidate.accent as typeof accentOptions[number])
      ? candidate.accent
      : defaultAppearancePreferences.accent,
    membersVisible: typeof candidate.membersVisible === "boolean" ? candidate.membersVisible : defaultAppearancePreferences.membersVisible,
    channelWidth: clampedNumber(candidate.channelWidth, defaultAppearancePreferences.channelWidth, 220, 380),
    memberWidth: clampedNumber(candidate.memberWidth, defaultAppearancePreferences.memberWidth, 220, 360),
    fontSizeDelta: Math.round(clampedNumber(candidate.fontSizeDelta, defaultAppearancePreferences.fontSizeDelta, -2, 3)),
    iconSizePercent: Math.round(clampedNumber(candidate.iconSizePercent, defaultAppearancePreferences.iconSizePercent, 85, 125) / 5) * 5,
    fontFamily: fontOptions.some((option) => option.value === candidate.fontFamily)
      ? candidate.fontFamily as FontFamily
      : defaultAppearancePreferences.fontFamily,
  };
}

export function loadAppearancePreferences(storage: AppearanceStorage | null = availableStorage()): AppearancePreferences {
  if (!storage) return { ...defaultAppearancePreferences };
  try {
    const serialized = storage.getItem(storageKey);
    return serialized ? normalizeAppearancePreferences(JSON.parse(serialized)) : { ...defaultAppearancePreferences };
  } catch {
    return { ...defaultAppearancePreferences };
  }
}

export function saveAppearancePreferences(preferences: AppearancePreferences, storage: AppearanceStorage | null = availableStorage()): void {
  if (!storage) return;
  try {
    storage.setItem(storageKey, JSON.stringify(normalizeAppearancePreferences(preferences)));
  } catch {
    // Appearance persistence must not prevent the workspace from rendering.
  }
}
