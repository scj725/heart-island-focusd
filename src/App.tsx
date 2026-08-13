import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type WheelEvent,
} from "react";
import {
  Check,
  CircleDot,
  ClipboardList,
  Columns2,
  Copy,
  Download,
  GripVertical,
  ImageIcon,
  Keyboard,
  LocateFixed,
  MessageSquareText,
  Mic,
  Minus,
  ExternalLink,
  NotebookPen,
  Pencil,
  Pause,
  Play,
  Plus,
  Pin,
  RefreshCcw,
  Save,
  Search,
  SkipBack,
  SkipForward,
  Star,
  Trash2,
  Upload,
  Video,
  X,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { openUrl } from "@tauri-apps/plugin-opener";
import "./App.css";

export type IslandMode = "collapsed" | "expanded";

type IslandPage = "todo" | "music" | "clipboard" | "layout" | "notification";
type TodoPageMode = "today" | "daily" | "archive" | "review";
type ArchiveLayout = "cards" | "timeline";
type MediaPlaybackStatus = "unavailable" | "playing" | "paused";
type AgentProvider = "codex" | "claudeCode";
type AgentTaskPhase = "idle" | "running" | "completed" | "failed" | "stale";
type AgentVisualState = "idle" | "running" | "attention";

type TodoItem = {
  id: string;
  title: string;
  completed: boolean;
  createdAt: number;
};

type TodoArchive = {
  date: string;
  todos: TodoItem[];
  dailyNote: string;
  savedAt: number;
  savedToDisk: boolean;
  filePath?: string;
};

type SaveState = "idle" | "saving" | "saved" | "needs-path" | "error";
type SavePathState = "idle" | "saved";

type SaveTodoResult = {
  filePath: string;
};

type MediaState = {
  available: boolean;
  audioActive: boolean;
  audioPeak: number;
  playbackStatus: MediaPlaybackStatus;
  trackTitle: string;
  trackArtist: string;
  playbackPositionSeconds: number;
  updatedAt: number;
};

type ClipboardHistorySettings = {
  enabled: boolean;
  captureImages: boolean;
  autoPaste: boolean;
  maxItems: number;
  shortcut: string;
};

type ClipboardHistoryImage = {
  width: number;
  height: number;
  byteSize: number;
  originalPath: string;
  thumbnailPath: string;
  thumbnailDataUrl?: string;
};

type ClipboardHistoryItem = {
  id: string;
  kind: "text" | "image";
  hash: string;
  createdAt: number;
  copiedAt: number;
  favorite?: boolean;
  note?: string;
  preview: string;
  text?: string;
  image?: ClipboardHistoryImage;
};

type ClipboardHistorySnapshot = {
  settings: ClipboardHistorySettings;
  items: ClipboardHistoryItem[];
};

type AudioLevel = {
  active: boolean;
  peak: number;
  updatedAt: number;
};

type AppearanceMode = "classic" | "liquidGlass";
type NativeGlassState = "active" | "css-fallback" | "disabled";
type CollapsedContentMode = "auto" | "motivation";

type FocusTimerState = {
  remainingSeconds: number;
  isRunning: boolean;
  endsAt: number | null;
  completedSessions: number;
};

type LyricsState = {
  status: "idle" | "missing-metadata" | "loading" | "ready" | "empty" | "error";
  text: string;
};

type WindowsNotificationEvent = {
  source: string;
  notificationId: number;
  receivedAt: number;
  isExternal?: boolean;
  kind?: "text" | "voice" | "image" | "video" | string;
  title?: string;
  content?: string;
  mediaUrl?: string;
  actionUrl?: string;
  durationMs?: number;
  priority?: "normal" | "high" | string;
  pinned?: boolean;
};

type NotificationRules = {
  enabledKinds: Array<"text" | "voice" | "image" | "video">;
  allowHighPriorityAutoOpen: boolean;
  displayDurationSeconds: number;
};

type AgentTaskStatus = { phase: AgentTaskPhase; taskId?: string; updatedAt: number };
type AgentStatusSnapshot = Record<AgentProvider, AgentTaskStatus> & { updatedAt: number; statusPath: string };
type AgentHooksInstallResult = { scriptsDir: string; statusPath: string; codexConfigPath: string; claudeConfigPath: string; installedAt: number };
type AgentHooksInstallState = "idle" | "installing" | "installed" | "error";

type LyricLine = {
  time: number | null;
  text: string;
};

type IslandPosition = {
  x: number;
  y: number;
};

type IslandSettings = {
  appearanceMode: AppearanceMode;
  glassIntensity: number;
  opacity: number;
  sizeScale: number;
  marginY: number;
  taskTextColor: string;
  pulseColor: string;
  pulseBrightness: number;
  islandBackgroundColor: string;
  todoBackgroundColor: string;
  showTitle: boolean;
  islandIdentity: string;
  collapsedMinWidth: number;
  collapsedContentMode: CollapsedContentMode;
  motivationQuote: string;
  focusDurationMinutes: number;
  showLyrics: boolean;
  carryOverIncompleteTodos: boolean;
  enableTodoReorder: boolean;
  notificationRules: NotificationRules;
  motionIntensity: number;
  transitionSpeed: number;
  edgeGlow: number;
  shadowDepth: number;
  islandCornerRadius: number;
};

type IslandPreset = {
  id: string;
  name: string;
  settings: IslandSettings;
  createdAt: number;
  isDefault?: boolean;
};

type IslandShellProps = {
  mode: IslandMode;
  page: IslandPage;
  appearanceMode: AppearanceMode;
  nativeGlassState: NativeGlassState;
  isTucked: boolean;
  showTitle: boolean;
  islandIdentity: string;
  mediaState: MediaState;
  collapsedContent: string;
  isShowingMedia: boolean;
  isShowingNotification: boolean;
  notification: WindowsNotificationEvent | null;
  agentVisualState: AgentVisualState;
  agentStatusLabel: string;
  onOpenPage: (page: IslandPage) => void;
  onOpenNotification: () => void;
  onWindowDragStart: () => void;
  onCollapse: () => void;
  onResetPosition: () => void;
  onMinimize: () => void;
  onTuck: () => void;
  onReveal: () => void;
  onPageChange: (page: IslandPage) => void;
  children: ReactNode;
};

const STORAGE_KEY = "focusd-island-settings";
const EXTERNAL_NOTIFICATION_HISTORY_STORAGE_KEY = "focusd-island-external-notification-history";
const SETTINGS_PRESETS_STORAGE_KEY = "focusd-island-setting-presets";
const TODOS_STORAGE_KEY = "focusd-island-todos";
const ACTIVE_TODO_STORAGE_KEY = "focusd-island-active-todo";
const TODO_DATE_STORAGE_KEY = "focusd-island-current-date";
const TODO_ARCHIVE_STORAGE_KEY = "focusd-island-archives";
const DAILY_NOTE_STORAGE_KEY = "focusd-island-daily-note";
const TODO_SAVE_DIRECTORY_STORAGE_KEY = "focusd-island-save-directory";
const TODO_LAST_SAVED_SIGNATURE_STORAGE_KEY =
  "focusd-island-last-saved-signature";
const ISLAND_POSITION_STORAGE_KEY = "focusd-island-position";
const FOCUS_TIMER_STORAGE_KEY = "focusd-island-focus-timer";
const MIN_COLLAPSED_ISLAND_WIDTH = 280;
const MAX_COLLAPSED_ISLAND_WIDTH = 640;
const MIN_COLLAPSED_TEXT_UNITS = 2;
const MAX_COLLAPSED_TEXT_UNITS = 12;
const BASE_EXPANDED_ISLAND_HEIGHT = 306;
const TODO_ARCHIVE_EXPANDED_ISLAND_HEIGHT = 352;
const MUSIC_EXPANDED_ISLAND_HEIGHT = 370;
const CLIPBOARD_EXPANDED_ISLAND_HEIGHT = 430;
const EDITOR_EXPANDED_ISLAND_HEIGHT = 430;
const TODO_ROW_HEIGHT = 46;
const TODO_TITLE_CHARACTERS_PER_LINE = 32;
const TODO_MAX_ESTIMATED_TITLE_LINES = 5;
const TODO_GROW_START_ROWS = 2;
const TODO_SCROLL_START_ROWS = 6;
const MAX_CUSTOM_SETTING_PRESETS = 6;
const DEFAULT_TASK_TEXT_COLOR = "#1afbff";
const DEFAULT_CLIPBOARD_SHORTCUT = "Alt+Z";
const AUDIO_ACTIVE_THRESHOLD = 0.000015;
const DEFAULT_MEDIA_STATE: MediaState = {
  available: false,
  audioActive: false,
  audioPeak: 0,
  playbackStatus: "unavailable",
  trackTitle: "",
  trackArtist: "",
  playbackPositionSeconds: 0,
  updatedAt: 0,
};
const DEFAULT_AGENT_TASK_STATUS: AgentTaskStatus = { phase: "idle", updatedAt: 0 };
const DEFAULT_AGENT_STATUS: AgentStatusSnapshot = {
  codex: DEFAULT_AGENT_TASK_STATUS,
  claudeCode: DEFAULT_AGENT_TASK_STATUS,
  updatedAt: 0,
  statusPath: "",
};
const AGENT_PROVIDERS: AgentProvider[] = ["codex", "claudeCode"];
const AGENT_PROVIDER_LABELS: Record<AgentProvider, string> = { codex: "Codex", claudeCode: "Claude Code" };
const DEFAULT_CLIPBOARD_HISTORY: ClipboardHistorySnapshot = {
  settings: {
    enabled: true,
    captureImages: true,
    autoPaste: false,
    maxItems: 30,
    shortcut: DEFAULT_CLIPBOARD_SHORTCUT,
  },
  items: [],
};
const DEFAULT_SETTINGS: IslandSettings = {
  appearanceMode: "liquidGlass",
  glassIntensity: 72,
  opacity: 95,
  sizeScale: 1,
  marginY: 31,
  taskTextColor: DEFAULT_TASK_TEXT_COLOR,
  pulseColor: "#49e18f",
  pulseBrightness: 100,
  islandBackgroundColor: "#101013",
  todoBackgroundColor: "#ffffff",
  showTitle: true,
  islandIdentity: "❤",
  collapsedMinWidth: 320,
  collapsedContentMode: "auto",
  motivationQuote: "心有山海，步履从容，自有风来。",
  focusDurationMinutes: 25,
  showLyrics: true,
  carryOverIncompleteTodos: false,
  enableTodoReorder: false,
  notificationRules: {
    enabledKinds: ["text", "voice", "image", "video"],
    allowHighPriorityAutoOpen: true,
    displayDurationSeconds: 12,
  },
  motionIntensity: 70,
  transitionSpeed: 70,
  edgeGlow: 64,
  shadowDepth: 62,
  islandCornerRadius: 30,
};
const LEGACY_DEFAULT_PRESET_IDS = new Set(["default-white", "default-khaki"]);
const LEGACY_DEFAULT_PRESET_NAMES = new Set(["白色", "卡其"]);
const BUILT_IN_PRESET_IDS = new Set([
  "default-night",
  "default-glass",
  "default-focus",
]);
const BUILT_IN_PRESET_NAMES = new Set([
  "沉浸夜航",
  "清透玻璃",
  "专注红心",
]);

type LegacyIslandSettings = Partial<IslandSettings> & {
  margin?: number;
  taskTitleColor?: string;
  pendingTodoColor?: string;
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

function getColorSetting(value: unknown, fallback: string) {
  return typeof value === "string" && HEX_COLOR_PATTERN.test(value)
    ? value
    : fallback;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

/* Agent hook helpers are retained for persisted data compatibility. */
function isAgentAttentionPhase(phase: AgentTaskPhase) {
  return phase === "failed" || phase === "stale";
}

function getAgentVisualState(snapshot: AgentStatusSnapshot): AgentVisualState {
  const statuses = AGENT_PROVIDERS.map((provider) => snapshot[provider]);

  if (statuses.some((status) => isAgentAttentionPhase(status.phase))) {
    return "attention";
  }

  if (statuses.some((status) => status.phase === "running")) {
    return "running";
  }

  return "idle";
}

function getAgentStatusLabel(snapshot: AgentStatusSnapshot) {
  const attentionProvider = AGENT_PROVIDERS.find((provider) =>
    isAgentAttentionPhase(snapshot[provider].phase),
  );

  if (attentionProvider) {
    const phase = snapshot[attentionProvider].phase;
    return phase === "stale"
      ? `${AGENT_PROVIDER_LABELS[attentionProvider]} 可能已中断`
      : `${AGENT_PROVIDER_LABELS[attentionProvider]} 运行失败`;
  }

  const runningProvider = AGENT_PROVIDERS.find(
    (provider) => snapshot[provider].phase === "running",
  );

  if (runningProvider) {
    return `${AGENT_PROVIDER_LABELS[runningProvider]} 正在运行`;
  }

  return "AI Agent 空闲或已完成";
}

function getAgentPhaseLabel(phase: AgentTaskPhase) {
  switch (phase) {
    case "running":
      return "正在运行";
    case "completed":
      return "已完成";
    case "failed":
      return "运行失败";
    case "stale":
      return "可能已中断";
    case "idle":
    default:
      return "空闲";
  }
}

function hexToRgba(hex: string, alpha: number) {
  const normalized = HEX_COLOR_PATTERN.test(hex)
    ? hex.slice(1)
    : DEFAULT_SETTINGS.pulseColor.slice(1);
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

type ShortcutKeyboardEvent = Pick<
  KeyboardEvent,
  "altKey" | "ctrlKey" | "key" | "metaKey" | "shiftKey"
>;

const MODIFIER_KEY_NAMES = new Set([
  "Alt",
  "AltGraph",
  "Control",
  "Meta",
  "Shift",
]);

function normalizeShortcutKeyLabel(key: string) {
  if (key.length === 1) {
    return key.toUpperCase();
  }

  switch (key) {
    case " ":
    case "Spacebar":
      return "Space";
    case "Escape":
      return "Esc";
    case "ArrowUp":
      return "Up";
    case "ArrowDown":
      return "Down";
    case "ArrowLeft":
      return "Left";
    case "ArrowRight":
      return "Right";
    default:
      return key;
  }
}

function buildShortcutFromEvent(event: ShortcutKeyboardEvent) {
  if (MODIFIER_KEY_NAMES.has(event.key)) {
    return null;
  }

  const parts: string[] = [];

  if (event.ctrlKey) {
    parts.push("Ctrl");
  }

  if (event.altKey) {
    parts.push("Alt");
  }

  if (event.shiftKey) {
    parts.push("Shift");
  }

  if (event.metaKey) {
    parts.push("Win");
  }

  if (parts.length === 0) {
    return null;
  }

  parts.push(normalizeShortcutKeyLabel(event.key));
  return parts.join("+");
}

function normalizeClipboardShortcut(shortcut: string | undefined) {
  const text = shortcut?.trim();

  if (!text) {
    return DEFAULT_CLIPBOARD_SHORTCUT;
  }

  const parts = text
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean);
  const modifiers = new Set<string>();
  let keyLabel = "";

  for (const part of parts) {
    const normalized = part.toLowerCase();

    if (normalized === "ctrl" || normalized === "control") {
      modifiers.add("Ctrl");
    } else if (normalized === "alt" || normalized === "option") {
      modifiers.add("Alt");
    } else if (normalized === "shift") {
      modifiers.add("Shift");
    } else if (
      normalized === "win" ||
      normalized === "windows" ||
      normalized === "meta" ||
      normalized === "cmd" ||
      normalized === "super"
    ) {
      modifiers.add("Win");
    } else if (!keyLabel) {
      keyLabel = normalizeShortcutKeyLabel(part);
    }
  }

  if (!keyLabel || modifiers.size === 0) {
    return DEFAULT_CLIPBOARD_SHORTCUT;
  }

  return ["Ctrl", "Alt", "Shift", "Win"]
    .filter((modifier) => modifiers.has(modifier))
    .concat(keyLabel)
    .join("+");
}

function normalizeClipboardSettings(
  settings: ClipboardHistorySettings,
): ClipboardHistorySettings {
  return {
    ...settings,
    maxItems: clamp(Math.round(settings.maxItems), 5, 200),
    shortcut: normalizeClipboardShortcut(settings.shortcut),
  };
}

function matchesClipboardShortcut(
  event: KeyboardEvent,
  shortcut: string | undefined,
) {
  if (isEditableTarget(event.target)) {
    return false;
  }

  return (
    buildShortcutFromEvent(event) === normalizeClipboardShortcut(shortcut)
  );
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}

function normalizeSettings(
  settings: LegacyIslandSettings | null | undefined,
): IslandSettings {
  const taskTextColor = getColorSetting(
    settings?.taskTextColor ?? settings?.pendingTodoColor,
    getColorSetting(settings?.taskTitleColor, DEFAULT_SETTINGS.taskTextColor),
  );

  return {
    appearanceMode:
      settings?.appearanceMode === "classic" ||
      settings?.appearanceMode === "liquidGlass"
        ? settings.appearanceMode
        : "classic",
    glassIntensity: clamp(
      Number(settings?.glassIntensity ?? DEFAULT_SETTINGS.glassIntensity),
      25,
      100,
    ),
    opacity: clamp(Number(settings?.opacity ?? DEFAULT_SETTINGS.opacity), 50, 100),
    sizeScale: clamp(
      Number(settings?.sizeScale ?? DEFAULT_SETTINGS.sizeScale),
      0.75,
      1.4,
    ),
    marginY: clamp(
      Number(settings?.marginY ?? settings?.margin ?? DEFAULT_SETTINGS.marginY),
      0,
      160,
    ),
    taskTextColor,
    pulseColor: getColorSetting(
      settings?.pulseColor,
      DEFAULT_SETTINGS.pulseColor,
    ),
    pulseBrightness: clamp(
      Number(settings?.pulseBrightness ?? DEFAULT_SETTINGS.pulseBrightness),
      50,
      160,
    ),
    islandBackgroundColor: getColorSetting(
      settings?.islandBackgroundColor,
      DEFAULT_SETTINGS.islandBackgroundColor,
    ),
    todoBackgroundColor: getColorSetting(
      settings?.todoBackgroundColor,
      DEFAULT_SETTINGS.todoBackgroundColor,
    ),
    showTitle:
      typeof settings?.showTitle === "boolean"
        ? settings.showTitle
        : DEFAULT_SETTINGS.showTitle,
    islandIdentity:
      typeof settings?.islandIdentity === "string"
        ? settings.islandIdentity.trim().slice(0, 12)
        : DEFAULT_SETTINGS.islandIdentity,
    collapsedMinWidth: clamp(
      Number(settings?.collapsedMinWidth ?? DEFAULT_SETTINGS.collapsedMinWidth),
      MIN_COLLAPSED_ISLAND_WIDTH,
      MAX_COLLAPSED_ISLAND_WIDTH,
    ),
    collapsedContentMode:
      settings?.collapsedContentMode === "motivation"
        ? "motivation"
        : DEFAULT_SETTINGS.collapsedContentMode,
    motivationQuote:
      typeof settings?.motivationQuote === "string" && settings.motivationQuote.trim()
        ? settings.motivationQuote.trim().slice(0, 120)
        : DEFAULT_SETTINGS.motivationQuote,
    focusDurationMinutes: clamp(
      Number(settings?.focusDurationMinutes ?? DEFAULT_SETTINGS.focusDurationMinutes),
      5,
      120,
    ),
    showLyrics:
      typeof settings?.showLyrics === "boolean"
        ? settings.showLyrics
        : DEFAULT_SETTINGS.showLyrics,
    carryOverIncompleteTodos:
      typeof settings?.carryOverIncompleteTodos === "boolean"
        ? settings.carryOverIncompleteTodos
        : DEFAULT_SETTINGS.carryOverIncompleteTodos,
    enableTodoReorder:
      typeof settings?.enableTodoReorder === "boolean"
        ? settings.enableTodoReorder
        : DEFAULT_SETTINGS.enableTodoReorder,
    notificationRules: normalizeNotificationRules(settings?.notificationRules),
    motionIntensity: clamp(Number(settings?.motionIntensity ?? DEFAULT_SETTINGS.motionIntensity), 0, 100),
    transitionSpeed: clamp(Number(settings?.transitionSpeed ?? DEFAULT_SETTINGS.transitionSpeed), 0, 100),
    edgeGlow: clamp(Number(settings?.edgeGlow ?? DEFAULT_SETTINGS.edgeGlow), 0, 100),
    shadowDepth: clamp(Number(settings?.shadowDepth ?? DEFAULT_SETTINGS.shadowDepth), 0, 100),
    islandCornerRadius: clamp(Number(settings?.islandCornerRadius ?? DEFAULT_SETTINGS.islandCornerRadius), 16, 42),
  };
}

function normalizeNotificationRules(value: unknown): NotificationRules {
  const candidate = value as Partial<NotificationRules> | null | undefined;
  const enabledKinds = Array.isArray(candidate?.enabledKinds)
    ? candidate.enabledKinds.filter(
        (kind): kind is NotificationRules["enabledKinds"][number] =>
          kind === "text" || kind === "voice" || kind === "image" || kind === "video",
      )
    : DEFAULT_SETTINGS.notificationRules.enabledKinds;

  return {
    enabledKinds,
    allowHighPriorityAutoOpen:
      typeof candidate?.allowHighPriorityAutoOpen === "boolean"
        ? candidate.allowHighPriorityAutoOpen
        : DEFAULT_SETTINGS.notificationRules.allowHighPriorityAutoOpen,
    displayDurationSeconds: clamp(
      Number(
        candidate?.displayDurationSeconds ??
          DEFAULT_SETTINGS.notificationRules.displayDurationSeconds,
      ),
      3,
      60,
    ),
  };
}

function getDefaultSettingPresets(): IslandPreset[] {
  return [
    {
      id: "default-night",
      name: "沉浸夜航",
      settings: normalizeSettings({
        ...DEFAULT_SETTINGS,
        appearanceMode: "liquidGlass",
        islandBackgroundColor: "#101013",
        pulseColor: "#ff5364",
        opacity: 95,
      }),
      createdAt: 0,
      isDefault: true,
    },
    {
      id: "default-glass",
      name: "清透玻璃",
      settings: normalizeSettings({
        ...DEFAULT_SETTINGS,
        appearanceMode: "liquidGlass",
        islandBackgroundColor: "#14212a",
        pulseColor: "#74d6ff",
        glassIntensity: 90,
        opacity: 88,
      }),
      createdAt: 0,
      isDefault: true,
    },
    {
      id: "default-focus",
      name: "专注红心",
      settings: normalizeSettings({
        ...DEFAULT_SETTINGS,
        appearanceMode: "classic",
        islandIdentity: "❤",
        islandBackgroundColor: "#211114",
        pulseColor: "#ff5364",
        collapsedContentMode: "motivation",
      }),
      createdAt: 0,
      isDefault: true,
    },
  ];
}

function mergeWithDefaultSettingPresets(presets: IslandPreset[]) {
  const defaultPresets = getDefaultSettingPresets();
  const seenCustomPresets = new Set<string>();
  const customPresets = presets
    .filter(
      (preset) =>
        !preset.isDefault &&
        !LEGACY_DEFAULT_PRESET_IDS.has(preset.id) &&
        !BUILT_IN_PRESET_IDS.has(preset.id) &&
        !LEGACY_DEFAULT_PRESET_NAMES.has(preset.name.trim()) &&
        !BUILT_IN_PRESET_NAMES.has(preset.name.trim()),
    )
    .filter((preset) => {
      const key = `${preset.id}:${preset.name.trim()}`;
      if (seenCustomPresets.has(key)) {
        return false;
      }
      seenCustomPresets.add(key);
      return true;
    })
    .map((preset) => ({ ...preset, isDefault: false }))
    .slice(0, MAX_CUSTOM_SETTING_PRESETS);

  return [...defaultPresets, ...customPresets];
}

function isDefaultSettingPreset(presetId: string) {
  return (
    LEGACY_DEFAULT_PRESET_IDS.has(presetId) ||
    BUILT_IN_PRESET_IDS.has(presetId) ||
    presetId.startsWith("default-")
  );
}

function getTodoTitleLineCount(title: string) {
  const visualLength = Array.from(title).reduce(
    (total, character) => total + (character.charCodeAt(0) > 255 ? 1.6 : 1),
    0,
  );

  return clamp(
    Math.ceil(visualLength / TODO_TITLE_CHARACTERS_PER_LINE),
    1,
    TODO_MAX_ESTIMATED_TITLE_LINES,
  );
}

function getCollapsedIslandWidth(text: string, minimumWidth: number) {
  const visualUnits = Array.from(text.trim()).reduce((total, character) => {
    if (/\s/.test(character)) {
      return total + 0.35;
    }

    return total + (character.charCodeAt(0) <= 255 ? 0.55 : 1);
  }, 0);
  const widthProgress =
    (clamp(
      visualUnits,
      MIN_COLLAPSED_TEXT_UNITS,
      MAX_COLLAPSED_TEXT_UNITS,
    ) -
      MIN_COLLAPSED_TEXT_UNITS) /
    (MAX_COLLAPSED_TEXT_UNITS - MIN_COLLAPSED_TEXT_UNITS);

  return Math.round(
    minimumWidth +
      widthProgress *
        (MAX_COLLAPSED_ISLAND_WIDTH - minimumWidth),
  );
}

function getTodoVisualRows(todoList: TodoItem[]) {
  return todoList.reduce(
    (total, todo) => total + getTodoTitleLineCount(todo.title),
    0,
  );
}

function loadSettings(): IslandSettings {
  const stored = window.localStorage.getItem(STORAGE_KEY);

  if (!stored) {
    return DEFAULT_SETTINGS;
  }

  try {
    const parsed = JSON.parse(stored) as Partial<IslandSettings> & {
      margin?: number;
    };

    return normalizeSettings(parsed);
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function loadIslandPosition(): IslandPosition | null {
  const stored = window.localStorage.getItem(ISLAND_POSITION_STORAGE_KEY);

  if (!stored) {
    return null;
  }

  try {
    const position = JSON.parse(stored) as Partial<IslandPosition>;
    if (
      typeof position.x !== "number" ||
      typeof position.y !== "number" ||
      !Number.isFinite(position.x) ||
      !Number.isFinite(position.y)
    ) {
      return null;
    }

    return { x: Math.round(position.x), y: Math.round(position.y) };
  } catch {
    return null;
  }
}

function loadSettingPresets(): IslandPreset[] {
  const stored = window.localStorage.getItem(SETTINGS_PRESETS_STORAGE_KEY);

  if (!stored) {
    return getDefaultSettingPresets();
  }

  try {
    const parsed = JSON.parse(stored) as Partial<IslandPreset>[];

    if (!Array.isArray(parsed)) {
      return getDefaultSettingPresets();
    }

    return loadSettingPresetsFromValue(parsed);
  } catch {
    return getDefaultSettingPresets();
  }
}

function loadSettingPresetsFromValue(value: unknown): IslandPreset[] {
  if (!Array.isArray(value)) {
    return getDefaultSettingPresets();
  }

  const presets = (value as Partial<IslandPreset>[])
      .map((preset, index) => ({
        id:
          typeof preset.id === "string" && preset.id
            ? preset.id
            : createTodoId(),
        name:
          typeof preset.name === "string" && preset.name.trim()
            ? preset.name.trim()
            : `样式预设 ${index + 1}`,
        settings: normalizeSettings(preset.settings),
        createdAt:
          typeof preset.createdAt === "number" ? preset.createdAt : Date.now(),
        isDefault: false,
      }));

  return mergeWithDefaultSettingPresets(presets);
}

function normalizeTodo(todo: Partial<TodoItem>): TodoItem {
  return {
    id: typeof todo.id === "string" && todo.id ? todo.id : createTodoId(),
    title: todo.title?.trim() ?? "",
    completed: Boolean(todo.completed),
    createdAt: typeof todo.createdAt === "number" ? todo.createdAt : Date.now(),
  };
}

function loadTodos(): TodoItem[] {
  const stored = window.localStorage.getItem(TODOS_STORAGE_KEY);

  if (!stored) {
    return [];
  }

  try {
    const parsed = JSON.parse(stored) as Partial<TodoItem>[];

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((todo) => typeof todo.title === "string" && todo.title.trim())
      .map(normalizeTodo);
  } catch {
    return [];
  }
}

function loadActiveTodoId() {
  return window.localStorage.getItem(ACTIVE_TODO_STORAGE_KEY);
}

function getLocalDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getDisplayDateParts(date: string) {
  const [fallbackYear = date, fallbackMonth = "", fallbackDay = ""] =
    date.split("-");
  const parsedDate = new Date(`${date}T00:00:00`);
  const weekdays = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
  const hasValidDate = !Number.isNaN(parsedDate.getTime());

  return {
    year: hasValidDate ? String(parsedDate.getFullYear()) : fallbackYear,
    month: hasValidDate
      ? String(parsedDate.getMonth() + 1).padStart(2, "0")
      : fallbackMonth,
    day: hasValidDate
      ? String(parsedDate.getDate()).padStart(2, "0")
      : fallbackDay,
    weekday: hasValidDate ? weekdays[parsedDate.getDay()] : "",
  };
}

function loadCurrentTodoDate() {
  return window.localStorage.getItem(TODO_DATE_STORAGE_KEY) ?? getLocalDateString();
}

function loadTodoArchives(): TodoArchive[] {
  const stored = window.localStorage.getItem(TODO_ARCHIVE_STORAGE_KEY);

  if (!stored) {
    return [];
  }

  try {
    const parsed = JSON.parse(stored) as Partial<TodoArchive>[];

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((archive) => typeof archive.date === "string" && archive.date)
      .map((archive) => ({
        date: archive.date ?? getLocalDateString(),
        todos: Array.isArray(archive.todos)
          ? archive.todos
              .filter(
                (todo) => typeof todo.title === "string" && todo.title.trim(),
              )
              .map(normalizeTodo)
          : [],
        dailyNote:
          typeof archive.dailyNote === "string" ? archive.dailyNote : "",
        savedAt: typeof archive.savedAt === "number" ? archive.savedAt : 0,
        savedToDisk: Boolean(archive.savedToDisk),
        filePath:
          typeof archive.filePath === "string" ? archive.filePath : undefined,
      }))
      .sort((a, b) => b.date.localeCompare(a.date));
  } catch {
    return [];
  }
}

function loadSaveDirectory() {
  return window.localStorage.getItem(TODO_SAVE_DIRECTORY_STORAGE_KEY) ?? "";
}

function loadDailyNote() {
  return window.localStorage.getItem(DAILY_NOTE_STORAGE_KEY) ?? "";
}

function loadExternalNotificationHistory() {
  const stored = window.localStorage.getItem(EXTERNAL_NOTIFICATION_HISTORY_STORAGE_KEY);
  if (!stored) return [] as WindowsNotificationEvent[];

  try {
    const history = JSON.parse(stored) as WindowsNotificationEvent[];
    return Array.isArray(history)
      ? history.filter((item) => item?.isExternal && typeof item.source === "string").slice(0, 20)
      : [];
  } catch {
    return [];
  }
}

function loadFocusTimer(): FocusTimerState {
  const fallback: FocusTimerState = {
    remainingSeconds: DEFAULT_SETTINGS.focusDurationMinutes * 60,
    isRunning: false,
    endsAt: null,
    completedSessions: 0,
  };
  const stored = window.localStorage.getItem(FOCUS_TIMER_STORAGE_KEY);

  if (!stored) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(stored) as Partial<FocusTimerState>;
    const endsAt = typeof parsed.endsAt === "number" ? parsed.endsAt : null;
    const isRunning = Boolean(parsed.isRunning && endsAt);
    const remainingSeconds = isRunning && endsAt
      ? Math.max(0, Math.ceil((endsAt - Date.now()) / 1000))
      : clamp(Number(parsed.remainingSeconds ?? fallback.remainingSeconds), 0, 7_200);

    return {
      remainingSeconds,
      isRunning: isRunning && remainingSeconds > 0,
      endsAt: isRunning && remainingSeconds > 0 ? endsAt : null,
      completedSessions: Math.max(0, Math.round(Number(parsed.completedSessions ?? 0))),
    };
  } catch {
    return fallback;
  }
}

function formatFocusTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

function formatPlaybackTime(seconds: number) {
  const value = Math.max(0, Math.floor(seconds));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;
}

function parseLyrics(text: string): LyricLine[] {
  const timestampPattern = /\[(\d{1,3}):(\d{2}(?:\.\d{1,3})?)\]/g;
  const lines: LyricLine[] = [];

  for (const rawLine of text.split("\n")) {
    const lyricText = rawLine.replace(timestampPattern, "").trim();
    const timestamps = [...rawLine.matchAll(timestampPattern)]
      .map((match) => Number(match[1]) * 60 + Number(match[2]))
      .filter(Number.isFinite);

    if (!lyricText) continue;
    if (timestamps.length === 0) {
      lines.push({ time: null, text: lyricText });
    } else {
      timestamps.forEach((time) => lines.push({ time, text: lyricText }));
    }
  }

  return lines.sort((left, right) => (left.time ?? Infinity) - (right.time ?? Infinity));
}

function isDisplayableImageUrl(value: string | undefined) {
  if (!value) return false;

  const url = value.trim();
  return /^https?:\/\//i.test(url) || /^data:image\//i.test(url);
}

function getActiveLyricIndex(lines: LyricLine[], playbackPositionSeconds: number) {
  if (!lines.some((line) => line.time !== null)) return -1;

  let activeIndex = -1;
  for (let index = 0; index < lines.length; index += 1) {
    const time = lines[index].time;
    if (time !== null && time <= playbackPositionSeconds + 0.15) {
      activeIndex = index;
    }
  }
  return activeIndex;
}

type LrcLibTrack = {
  trackName?: string | null;
  artistName?: string | null;
  plainLyrics?: string | null;
  syncedLyrics?: string | null;
};

function normalizeTrackText(value: string) {
  return value
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function cleanTrackTitle(title: string) {
  return title
    .replace(/\s*[\[(][^\])]{0,80}[\])]/g, "")
    .replace(/\s+-\s+(?:remaster(?:ed)?(?:\s+\d{4})?|live|official\s+(?:audio|video)|lyrics?\s+video|radio\s+edit|extended\s+mix|instrumental)\b.*$/i, "")
    .replace(/\s+(?:remaster(?:ed)?(?:\s+\d{4})?|official\s+(?:audio|video)|lyrics?\s+video)$/i, "")
    .trim();
}

function trackMatchScore(track: LrcLibTrack, title: string, artist: string) {
  const expectedTitle = normalizeTrackText(title);
  const candidateTitle = normalizeTrackText(track.trackName || "");
  const expectedArtist = normalizeTrackText(artist);
  const candidateArtist = normalizeTrackText(track.artistName || "");
  const hasLyrics = Boolean(track.plainLyrics || track.syncedLyrics);

  if (!hasLyrics || !candidateTitle) return -1;

  let score = candidateTitle === expectedTitle ? 100 : 0;
  if (
    candidateTitle.includes(expectedTitle) ||
    expectedTitle.includes(candidateTitle)
  ) score += 50;
  if (score === 0) return -1;
  if (expectedArtist && candidateArtist === expectedArtist) score += 30;
  if (
    expectedArtist &&
    (candidateArtist.includes(expectedArtist) || expectedArtist.includes(candidateArtist))
  ) score += 15;
  return score;
}

async function requestLyrics(
  url: string,
  signal?: AbortSignal,
): Promise<LrcLibTrack[] | null> {
  const response = await fetch(url, { signal });
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Lyrics request failed with status ${response.status}.`);
  }

  const data = await response.json() as LrcLibTrack | LrcLibTrack[];
  return Array.isArray(data) ? data : [data];
}

async function fetchQqMusicLyrics(title: string, artist: string) {
  const lyrics = await invoke<string>("get_qq_music_lyrics", { title, artist });
  return lyrics.slice(0, 12_000);
}

async function fetchTrackLyrics(
  title: string,
  artist: string,
  signal?: AbortSignal,
) {
  const titles = [...new Set([title, cleanTrackTitle(title)].filter(Boolean))];

  try {
    for (const lookupTitle of titles) {
      const qqLyrics = await fetchQqMusicLyrics(lookupTitle, artist);
      if (qqLyrics) return qqLyrics;
    }
  } catch (error) {
    console.warn("QQ Music lyrics lookup failed; falling back to LRCLIB.", error);
  }

  const findLyrics = (tracks: LrcLibTrack[] | null, lookupTitle: string) => {
    const match = tracks
      ?.map((track) => ({ track, score: trackMatchScore(track, lookupTitle, artist) }))
      .sort((a, b) => b.score - a.score)[0]?.track;
    return (match?.syncedLyrics || match?.plainLyrics || "").slice(0, 12_000);
  };

  if (artist) {
    for (const lookupTitle of titles) {
      const query = new URLSearchParams({
        track_name: lookupTitle,
        artist_name: artist,
      });
      const exactLyrics = findLyrics(
        await requestLyrics(`https://lrclib.net/api/get?${query.toString()}`, signal),
        lookupTitle,
      );
      if (exactLyrics) return exactLyrics;
    }
  }

  for (const lookupTitle of titles) {
    const query = new URLSearchParams({ track_name: lookupTitle });
    if (artist) query.set("artist_name", artist);
    const searchLyrics = findLyrics(
      await requestLyrics(`https://lrclib.net/api/search?${query.toString()}`, signal),
      lookupTitle,
    );
    if (searchLyrics) return searchLyrics;
  }

  if (artist) {
    for (const lookupTitle of titles) {
      const query = new URLSearchParams({ track_name: lookupTitle });
      const searchLyrics = findLyrics(
        await requestLyrics(`https://lrclib.net/api/search?${query.toString()}`, signal),
        lookupTitle,
      );
      if (searchLyrics) return searchLyrics;
    }
  }

  return "";
}

function getTodoSignature(date: string, todos: TodoItem[], dailyNote: string) {
  return JSON.stringify({
    date,
    todos: todos.map((todo) => ({
      title: todo.title,
      completed: todo.completed,
    })),
    dailyNote,
  });
}

function formatTodosAsMarkdown(todos: TodoItem[]) {
  return todos
    .map((todo) => `- [${todo.completed ? "x" : " "}] ${todo.title}`)
    .join("\n");
}

function formatTodoDocumentAsMarkdown(todos: TodoItem[], dailyNote: string) {
  const todoMarkdown = formatTodosAsMarkdown(todos);
  const dailyMarkdown = dailyNote.trimEnd();

  if (todoMarkdown && dailyMarkdown) {
    return `${todoMarkdown}\n\n${dailyMarkdown}`;
  }

  return todoMarkdown || dailyMarkdown;
}

function createTodoId() {
  if ("crypto" in window && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function IslandShell({
  mode,
  page,
  appearanceMode,
  nativeGlassState,
  isTucked,
  showTitle,
  islandIdentity,
  mediaState,
  collapsedContent,
  isShowingMedia,
  isShowingNotification,
  notification,
  agentVisualState,
  agentStatusLabel,
  onOpenPage,
  onOpenNotification,
  onWindowDragStart,
  onCollapse,
  onResetPosition,
  onMinimize,
  onTuck,
  onReveal,
  onPageChange,
  children,
}: IslandShellProps) {
  const glassFrameRef = useRef<number | null>(null);
  const windowDragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
  } | null>(null);
  const isExpanded = mode === "expanded";
  const isLiquidGlass = appearanceMode === "liquidGlass";
  const isMusicPlaying = mediaState.playbackStatus === "playing";
  const notificationImageUrl =
    isShowingNotification && notification?.kind === "image" &&
    isDisplayableImageUrl(notification.mediaUrl)
      ? notification.mediaUrl?.trim() ?? ""
      : "";
  const [failedNotificationImageUrl, setFailedNotificationImageUrl] = useState("");

  useEffect(() => {
    setFailedNotificationImageUrl("");
  }, [notification?.receivedAt]);
  const className = [
    "island",
    `island--${mode}`,
    `island--${page}`,
    `island--appearance-${appearanceMode}`,
    isLiquidGlass ? `island--glass-${nativeGlassState}` : "",
    showTitle && islandIdentity ? "" : "island--title-hidden",
  ]
    .filter(Boolean)
    .join(" ");
  const pulseClassName = [
    "island__pulse",
    `island__pulse--agent-${agentVisualState}`,
  ].join(" ");
  const agentStatusIconClassName = [
    "island__agent-status-icon",
    `island__agent-status-icon--${agentVisualState}`,
  ].join(" ");
  const collapsedLabel = isShowingMedia
    ? `正在播放：${collapsedContent}`
    : collapsedContent;
  const canOpenNotification = isShowingNotification && Boolean(notification?.isExternal);

  useEffect(
    () => () => {
      if (glassFrameRef.current !== null) {
        window.cancelAnimationFrame(glassFrameRef.current);
      }
    },
    [],
  );

  const handleGlassPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (
        !isLiquidGlass ||
        window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
        glassFrameRef.current !== null
      ) {
        return;
      }

      const island = event.currentTarget;
      const rect = island.getBoundingClientRect();
      const pointerX = clamp((event.clientX - rect.left) / rect.width, 0, 1);
      const pointerY = clamp((event.clientY - rect.top) / rect.height, 0, 1);

      glassFrameRef.current = window.requestAnimationFrame(() => {
        glassFrameRef.current = null;
        island.style.setProperty("--glass-pointer-x", `${pointerX * 100}%`);
        island.style.setProperty("--glass-pointer-y", `${pointerY * 100}%`);
      });
    },
    [isLiquidGlass],
  );

  const resetGlassPointer = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (!isLiquidGlass) {
        return;
      }

      if (glassFrameRef.current !== null) {
        window.cancelAnimationFrame(glassFrameRef.current);
        glassFrameRef.current = null;
      }

      event.currentTarget.style.setProperty("--glass-pointer-x", "50%");
      event.currentTarget.style.setProperty("--glass-pointer-y", "18%");
    },
    [isLiquidGlass],
  );

  const prepareWindowDrag = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (event.button !== 0 || isTucked) {
        return;
      }

      const target = event.target;
      if (
        target instanceof Element &&
        target.closest(
          "button, input, textarea, select, a, [contenteditable='true'], [data-window-drag='false']",
        )
      ) {
        return;
      }

      windowDragRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [isTucked],
  );

  const handleWindowDragMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const drag = windowDragRef.current;
      if (!drag || drag.pointerId !== event.pointerId || event.buttons !== 1) {
        return;
      }

      if (
        Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 3
      ) {
        return;
      }

      windowDragRef.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      event.preventDefault();
      onWindowDragStart();
    },
    [onWindowDragStart],
  );

  const cancelWindowDrag = useCallback(() => {
    windowDragRef.current = null;
  }, []);

  const finishCollapsedPointer = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const drag = windowDragRef.current;
      windowDragRef.current = null;

      if (drag?.pointerId === event.pointerId) {
        if (canOpenNotification) {
          onOpenNotification();
          return;
        }

        onOpenPage(page);
      }
    },
    [canOpenNotification, onOpenNotification, onOpenPage, page],
  );

  return (
    <section
      className={className}
      aria-label={collapsedLabel}
      onPointerMove={handleGlassPointerMove}
      onPointerLeave={resetGlassPointer}
      onMouseEnter={() => {
        if (isTucked) {
          onReveal();
        }
      }}
    >
      {isLiquidGlass && (
        <div className="island__glass" aria-hidden="true">
          <span className="island__glass-refraction" />
          <span className="island__glass-highlight" />
        </div>
      )}
      <div
        className="island__collapsed"
        aria-hidden={isExpanded}
        onPointerDown={prepareWindowDrag}
        onPointerMove={handleWindowDragMove}
        onPointerUp={finishCollapsedPointer}
        onPointerCancel={cancelWindowDrag}
      >
        <span className={pulseClassName} title={agentStatusLabel} />
        {showTitle && islandIdentity && (
          <span className="island__brand" aria-label="岛屿标识">
            {islandIdentity}
          </span>
        )}
        {notificationImageUrl && failedNotificationImageUrl !== notificationImageUrl ? (
          <img
            className="island__notification-thumbnail"
            src={notificationImageUrl}
            alt=""
            onError={() => setFailedNotificationImageUrl(notificationImageUrl)}
          />
        ) : null}
        <span
          className={[
            "island__collapsed-content",
            isShowingMedia ? "island__collapsed-content--media" : "",
            isShowingMedia && Array.from(collapsedContent).length > 22
              ? "island__collapsed-content--scrolling"
              : "",
          ]
            .filter(Boolean)
            .join(" ")}
          title={collapsedContent}
        >
          {showTitle && islandIdentity ? "· " : ""}
          {collapsedContent}
        </span>
        <MusicWaveButton
          isAvailable={mediaState.available || mediaState.audioActive}
          isPlaying={isMusicPlaying}
          audioPeak={mediaState.audioPeak}
          label="打开音乐控制"
          onClick={() => onOpenPage("music")}
        />
        <button
          className="island__quiet-button"
          type="button"
          title="收起"
          aria-label="收起岛屿"
          onClick={(event) => {
            event.stopPropagation();
            onTuck();
          }}
        />
      </div>

      <div className="island__expanded" aria-hidden={!isExpanded}>
        <header className="island__header">
          <div className="island__title">
            <CircleDot
              className={agentStatusIconClassName}
              size={16}
              strokeWidth={2.2}
              aria-label={agentStatusLabel}
            />
            {showTitle && islandIdentity && <span>{islandIdentity}</span>}
          </div>

          <div
            className="editor-dots"
            aria-label="岛屿编辑"
          >
            <button
              className={`dot-button dot-button--todo ${
                page === "todo" ? "dot-button--active" : ""
              }`}
              type="button"
              title="任务清单"
              aria-label="任务清单"
              onClick={(event) => {
                event.stopPropagation();
                onPageChange("todo");
              }}
            />
            <button
              className={`dot-button dot-button--music ${
                page === "music" ? "dot-button--active" : ""
              }`}
              type="button"
              title="音乐"
              aria-label="音乐"
              onClick={(event) => {
                event.stopPropagation();
                onPageChange("music");
              }}
            />
            <button
              className={`dot-button dot-button--clipboard ${
                page === "clipboard" ? "dot-button--active" : ""
              }`}
              type="button"
              title="剪贴板历史"
              aria-label="剪贴板历史"
              onClick={(event) => {
                event.stopPropagation();
                onPageChange("clipboard");
              }}
            />
            <button
              className={`dot-button dot-button--notification ${
                page === "notification" ? "dot-button--active" : ""
              }`}
              type="button"
              title="接口扩展"
              aria-label="接口扩展"
              onClick={(event) => {
                event.stopPropagation();
                onPageChange("notification");
              }}
            />
            <button
              className={`dot-button dot-button--layout ${
                page === "layout" ? "dot-button--active" : ""
              }`}
              type="button"
              title="布局编辑"
              aria-label="布局编辑"
              onClick={(event) => {
                event.stopPropagation();
                onPageChange("layout");
              }}
            />
          </div>

          <div
            className="island__collapse-target"
            data-window-drag="false"
            onClick={onCollapse}
          />

          <div className="window-actions">
            <button
              className="icon-button"
              type="button"
              title="复位"
              aria-label="恢复岛屿默认位置"
              onClick={(event) => {
                event.stopPropagation();
                onResetPosition();
              }}
            >
              <LocateFixed size={17} strokeWidth={2.2} />
            </button>
            <button
              className="icon-button"
              type="button"
              title="最小化到托盘"
              aria-label="最小化到托盘"
              onClick={(event) => {
                event.stopPropagation();
                onMinimize();
              }}
            >
              <Minus size={18} strokeWidth={2.2} />
            </button>
          </div>
        </header>
        <div className="island__content">{children}</div>
      </div>
    </section>
  );
}

function MusicWaveButton({
  isAvailable,
  isPlaying,
  audioPeak,
  label,
  onClick,
}: {
  isAvailable: boolean;
  isPlaying: boolean;
  audioPeak: number;
  label: string;
  onClick: () => void;
}) {
  const [phase, setPhase] = useState(0);
  const className = [
    "music-wave-button",
    isAvailable ? "music-wave-button--available" : "music-wave-button--idle",
    isPlaying ? "music-wave-button--playing" : "music-wave-button--paused",
  ]
    .filter(Boolean)
    .join(" ");
  const shouldAnimate = isAvailable || isPlaying;
  const prefersReducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    if (!shouldAnimate) {
      setPhase(0);
      return;
    }

    const interval = window.setInterval(
      () => {
        setPhase(performance.now() / (isPlaying ? 260 : 900));
      },
      prefersReducedMotion ? 420 : isPlaying ? 72 : 180,
    );

    return () => window.clearInterval(interval);
  }, [isPlaying, prefersReducedMotion, shouldAnimate]);

  const liftedPeak = isPlaying
    ? clamp(Math.log1p(clamp(audioPeak, 0, 1) * 150) / Math.log1p(150), 0, 1)
    : 0;
  const barScales = [0.34, 0.72, 0.48, 0.86, 0.42].map((bar, index) => {
    const floor = isAvailable ? 0.22 : 0.12;
    const breath =
      shouldAnimate && !prefersReducedMotion
        ? 0.07 + Math.sin(phase + index * 0.82) * 0.045
        : 0;
    const movement =
      liftedPeak *
      (0.26 + bar * 1.02) *
      (0.82 + Math.sin(phase * (1.15 + index * 0.08) + index * 1.7) * 0.24);

    return clamp(floor + breath + movement, 0.12, 1.22);
  });

  return (
    <button
      className={className}
      type="button"
      title={label}
      aria-label={label}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    >
      {barScales.map((scale, index) => (
        <span
          key={index}
          style={
            {
              "--wave-scale": scale.toFixed(3),
              "--wave-opacity": (0.42 + scale * 0.52).toFixed(3),
            } as CSSProperties
          }
        />
      ))}
    </button>
  );
}

function SliderControl({
  label,
  value,
  min,
  max,
  step,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="slider-control">
      <span className="slider-control__meta">
        <span>{label}</span>
        <strong>
          {step < 1 ? value.toFixed(2) : Math.round(value)}
          {suffix}
        </strong>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
      />
    </label>
  );
}

function ColorControl({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="color-control">
      <span className="color-control__meta">
        <span>{label}</span>
        <strong>{value.toUpperCase()}</strong>
      </span>
      <input
        type="color"
        value={value}
        aria-label={label}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    </label>
  );
}

function ToggleControl({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="toggle-control">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.currentTarget.checked)}
      />
      <span className="toggle-control__switch" aria-hidden="true" />
    </label>
  );
}

function AppearanceModeControl({
  value,
  onChange,
}: {
  value: AppearanceMode;
  onChange: (value: AppearanceMode) => void;
}) {
  return (
    <div className="appearance-mode-control">
      <span>外观模式</span>
      <div className="appearance-mode-control__segments" role="group">
        <button
          className={value === "classic" ? "appearance-mode-control--active" : ""}
          type="button"
          aria-pressed={value === "classic"}
          onClick={() => onChange("classic")}
        >
          经典
        </button>
        <button
          className={
            value === "liquidGlass" ? "appearance-mode-control--active" : ""
          }
          type="button"
          aria-pressed={value === "liquidGlass"}
          onClick={() => onChange("liquidGlass")}
        >
          液态玻璃
        </button>
      </div>
    </div>
  );
}

function NumberControl({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="number-control">
      <span>{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(event) => {
          const nextValue = Number(event.currentTarget.value);

          if (Number.isFinite(nextValue)) {
            onChange(clamp(Math.round(nextValue), min, max));
          }
        }}
      />
    </label>
  );
}

function LayoutEditor({
  settings,
  clipboardSettings,
  saveDirectoryDraft,
  savePathState,
  highlightSavePath,
  focusClipboardShortcutToken,
  presets,
  launchAtStartup,
  agentStatus,
  clearingAgentProvider,
  agentHooksInstallState,
  agentHooksInstallResult,
  agentHooksInstallError,
  onSettingsChange,
  onClipboardSettingsChange,
  onReset,
  onSaveDirectoryDraftChange,
  onSaveDirectory,
  onSavePreset,
  onApplyPreset,
  onRenamePreset,
  onDeletePreset,
  onLaunchAtStartupChange,
  onClearAgentStatus,
  onInstallAgentHooks,
  onClipboardShortcutFocusHandled,
  onExportBackup,
  onImportBackup,
}: {
  settings: IslandSettings;
  clipboardSettings: ClipboardHistorySettings;
  saveDirectoryDraft: string;
  savePathState: SavePathState;
  highlightSavePath: boolean;
  focusClipboardShortcutToken: number;
  presets: IslandPreset[];
  launchAtStartup: boolean;
  agentStatus: AgentStatusSnapshot;
  clearingAgentProvider: AgentProvider | null;
  agentHooksInstallState: AgentHooksInstallState;
  agentHooksInstallResult: AgentHooksInstallResult | null;
  agentHooksInstallError: string;
  onSettingsChange: (settings: IslandSettings) => void;
  onClipboardSettingsChange: (settings: ClipboardHistorySettings) => void;
  onReset: () => void;
  onSaveDirectoryDraftChange: (value: string) => void;
  onSaveDirectory: () => void;
  onSavePreset: () => void;
  onApplyPreset: (presetId: string) => void;
  onRenamePreset: (presetId: string, name: string) => void;
  onDeletePreset: (presetId: string) => void;
  onLaunchAtStartupChange: (enabled: boolean) => void;
  onClearAgentStatus: (provider: AgentProvider) => void;
  onInstallAgentHooks: () => void;
  onClipboardShortcutFocusHandled: () => void;
  onExportBackup: () => void;
  onImportBackup: (file: File) => void;
}) {
  const savePathPanelRef = useRef<HTMLElement | null>(null);
  const savePathInputRef = useRef<HTMLInputElement | null>(null);
  const clipboardShortcutPanelRef = useRef<HTMLElement | null>(null);
  const clipboardShortcutButtonRef = useRef<HTMLButtonElement | null>(null);
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null);
  const [presetNameDraft, setPresetNameDraft] = useState("");
  const [isRecordingShortcut, setIsRecordingShortcut] = useState(false);
  const backupInputRef = useRef<HTMLInputElement | null>(null);

  const startPresetRename = useCallback((preset: IslandPreset) => {
    setEditingPresetId(preset.id);
    setPresetNameDraft(preset.name);
  }, []);

  const commitPresetRename = useCallback(() => {
    if (!editingPresetId) {
      return;
    }

    onRenamePreset(editingPresetId, presetNameDraft);
    setEditingPresetId(null);
    setPresetNameDraft("");
  }, [editingPresetId, onRenamePreset, presetNameDraft]);

  useEffect(() => {
    if (!highlightSavePath) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      const editorPanel = savePathPanelRef.current?.closest(".editor-panel");

      if (editorPanel instanceof HTMLElement) {
        editorPanel.scrollTo({
          top: editorPanel.scrollHeight,
          behavior: "smooth",
        });
      }

      savePathInputRef.current?.focus({ preventScroll: true });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [highlightSavePath]);

  useEffect(() => {
    if (focusClipboardShortcutToken <= 0) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      const editorPanel = clipboardShortcutPanelRef.current?.closest(".editor-panel");

      if (editorPanel instanceof HTMLElement && clipboardShortcutPanelRef.current) {
        const targetTop = clipboardShortcutPanelRef.current.offsetTop - 12;
        editorPanel.scrollTo({ top: targetTop, behavior: "smooth" });
      }

      clipboardShortcutButtonRef.current?.focus({ preventScroll: true });
      setIsRecordingShortcut(true);
      onClipboardShortcutFocusHandled();
    });

    return () => window.cancelAnimationFrame(frame);
  }, [focusClipboardShortcutToken, onClipboardShortcutFocusHandled]);

  const handleShortcutKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLButtonElement>) => {
      if (!isRecordingShortcut) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      if (event.key === "Escape") {
        setIsRecordingShortcut(false);
        return;
      }

      const shortcut = buildShortcutFromEvent(event.nativeEvent);

      if (!shortcut) {
        return;
      }

      onClipboardSettingsChange({
        ...clipboardSettings,
        shortcut,
      });
      setIsRecordingShortcut(false);
    },
    [clipboardSettings, isRecordingShortcut, onClipboardSettingsChange],
  );

  const agentStatusRows = AGENT_PROVIDERS.map((provider) => {
    const status = agentStatus[provider];
    return {
      provider,
      label: AGENT_PROVIDER_LABELS[provider],
      phase: status.phase,
      phaseLabel: getAgentPhaseLabel(status.phase),
      needsAttention: isAgentAttentionPhase(status.phase),
    };
  });
  const agentStatusLabel = getAgentStatusLabel(agentStatus);

  return (
    <div className="editor-panel">
      <div className="editor-panel__header">
        <span>设置</span>
        <button
          className="reset-button"
          type="button"
          title="恢复默认"
          aria-label="恢复默认"
          onClick={onReset}
        >
          <RefreshCcw size={15} strokeWidth={2.2} />
        </button>
      </div>

      <section className="settings-section settings-section--layout">
        <div className="settings-section__header">
          <span>布局设置</span>
        </div>
        <AppearanceModeControl
          value={settings.appearanceMode}
          onChange={(appearanceMode) =>
            onSettingsChange({ ...settings, appearanceMode })
          }
        />
        {settings.appearanceMode === "liquidGlass" && (
          <SliderControl
            label="玻璃强度"
            value={settings.glassIntensity}
            min={25}
            max={100}
            step={1}
            suffix="%"
            onChange={(glassIntensity) =>
              onSettingsChange({ ...settings, glassIntensity })
            }
          />
        )}
        <SliderControl
          label="不透明度"
          value={settings.opacity}
          min={50}
          max={100}
          step={1}
          suffix="%"
          onChange={(opacity) => onSettingsChange({ ...settings, opacity })}
        />
        <SliderControl
          label="整体大小"
          value={settings.sizeScale}
          min={0.75}
          max={1.4}
          step={0.01}
          suffix="x"
          onChange={(sizeScale) => onSettingsChange({ ...settings, sizeScale })}
        />
        <SliderControl
          label="上下边距"
          value={settings.marginY}
          min={0}
          max={160}
          step={1}
          suffix="px"
          onChange={(marginY) => onSettingsChange({ ...settings, marginY })}
        />
        <ToggleControl
          label="开机自启动"
          checked={launchAtStartup}
          onChange={onLaunchAtStartupChange}
        />
        <ToggleControl
          label="显示岛屿标识"
          checked={settings.showTitle}
          onChange={(showTitle) => onSettingsChange({ ...settings, showTitle })}
        />
        <label className="quote-control">
          <span>岛屿标识</span>
          <input
            value={settings.islandIdentity}
            maxLength={12}
            disabled={!settings.showTitle}
            placeholder="❤"
            onChange={(event) =>
              onSettingsChange({
                ...settings,
                islandIdentity: event.currentTarget.value,
              })
            }
          />
        </label>
        <NumberControl
          label="收起时最小宽度"
          value={settings.collapsedMinWidth}
          min={MIN_COLLAPSED_ISLAND_WIDTH}
          max={MAX_COLLAPSED_ISLAND_WIDTH}
          onChange={(collapsedMinWidth) =>
            onSettingsChange({ ...settings, collapsedMinWidth })
          }
        />
        <div className="settings-section__subheader">动效与材质</div>
        <SliderControl
          label="动效强度"
          value={settings.motionIntensity}
          min={0}
          max={100}
          step={1}
          suffix="%"
          onChange={(motionIntensity) => onSettingsChange({ ...settings, motionIntensity })}
        />
        <SliderControl
          label="展开速度"
          value={settings.transitionSpeed}
          min={0}
          max={100}
          step={1}
          suffix="%"
          onChange={(transitionSpeed) => onSettingsChange({ ...settings, transitionSpeed })}
        />
        <SliderControl
          label="边缘高光"
          value={settings.edgeGlow}
          min={0}
          max={100}
          step={1}
          suffix="%"
          onChange={(edgeGlow) => onSettingsChange({ ...settings, edgeGlow })}
        />
        <SliderControl
          label="阴影深度"
          value={settings.shadowDepth}
          min={0}
          max={100}
          step={1}
          suffix="%"
          onChange={(shadowDepth) => onSettingsChange({ ...settings, shadowDepth })}
        />
        <SliderControl
          label="展开圆角"
          value={settings.islandCornerRadius}
          min={16}
          max={42}
          step={1}
          suffix="px"
          onChange={(islandCornerRadius) => onSettingsChange({ ...settings, islandCornerRadius })}
        />
        <ToggleControl
          label="播放时优先显示媒体"
          checked={settings.collapsedContentMode === "auto"}
          onChange={(enabled) =>
            onSettingsChange({
              ...settings,
              collapsedContentMode: enabled ? "auto" : "motivation",
            })
          }
        />
        <label className="quote-control">
          <span>收起时金句</span>
          <input
            value={settings.motivationQuote}
            maxLength={120}
            onChange={(event) =>
              onSettingsChange({
                ...settings,
                motivationQuote: event.currentTarget.value,
              })
            }
          />
        </label>
      </section>

      <section className="settings-section settings-section--todo">
        <div className="settings-section__header">
          <span>待办设置</span>
        </div>
        <ToggleControl
          label="自动将未完成任务写入下一天"
          checked={settings.carryOverIncompleteTodos}
          onChange={(carryOverIncompleteTodos) =>
            onSettingsChange({ ...settings, carryOverIncompleteTodos })
          }
        />
        <ToggleControl
          label="允许拖动调整任务顺序"
          checked={settings.enableTodoReorder}
          onChange={(enableTodoReorder) =>
            onSettingsChange({ ...settings, enableTodoReorder })
          }
        />
        <NumberControl
          label="专注时长（分钟）"
          value={settings.focusDurationMinutes}
          min={5}
          max={120}
          onChange={(focusDurationMinutes) =>
            onSettingsChange({ ...settings, focusDurationMinutes })
          }
        />
        <ToggleControl
          label="音乐页自动显示歌词"
          checked={settings.showLyrics}
          onChange={(showLyrics) =>
            onSettingsChange({ ...settings, showLyrics })
          }
        />
      </section>

      <section className="settings-section settings-section--notifications">
        <div className="settings-section__header"><span>通知规则</span></div>
        <div className="notification-kind-grid">
          {(["text", "image", "video", "voice"] as const).map((kind) => {
            const labels = { text: "文字", image: "图片", video: "视频", voice: "语音" };
            const checked = settings.notificationRules.enabledKinds.includes(kind);
            return <label className="notification-kind-option" key={kind}>
              <input type="checkbox" checked={checked} onChange={() => {
                const enabledKinds = checked ? settings.notificationRules.enabledKinds.filter((item) => item !== kind) : [...settings.notificationRules.enabledKinds, kind];
                onSettingsChange({ ...settings, notificationRules: { ...settings.notificationRules, enabledKinds } });
              }} />
              <span>{labels[kind]}</span>
            </label>;
          })}
        </div>
        <ToggleControl label="高优先级消息自动展开" checked={settings.notificationRules.allowHighPriorityAutoOpen} onChange={(allowHighPriorityAutoOpen) => onSettingsChange({ ...settings, notificationRules: { ...settings.notificationRules, allowHighPriorityAutoOpen } })} />
        <NumberControl label="通知停留时间（秒）" value={settings.notificationRules.displayDurationSeconds} min={3} max={60} onChange={(displayDurationSeconds) => onSettingsChange({ ...settings, notificationRules: { ...settings.notificationRules, displayDurationSeconds } })} />
      </section>

      <section className="settings-section settings-section--backup">
        <div className="settings-section__header"><span>数据备份</span></div>
        <p className="settings-section__hint">导出会包含待办、每日记录、外观设置、剪贴板设置和接口消息记录。</p>
        <div className="backup-actions">
          <button className="backup-action" type="button" onClick={onExportBackup}><Download size={14} strokeWidth={2.3} />导出备份</button>
          <button className="backup-action" type="button" onClick={() => backupInputRef.current?.click()}><Upload size={14} strokeWidth={2.3} />导入备份</button>
          <input ref={backupInputRef} className="backup-file-input" type="file" accept="application/json,.json" onChange={(event) => { const [file] = Array.from(event.currentTarget.files ?? []); if (file) onImportBackup(file); event.currentTarget.value = ""; }} />
        </div>
      </section>

      <section className="settings-section settings-section--agent-hooks">
        <div className="settings-section__header">
          <span>AI Agent 状态灯</span>
          <button
            className={[
              "agent-hooks-button",
              agentHooksInstallState === "installed"
                ? "agent-hooks-button--installed"
                : "",
            ]
              .filter(Boolean)
              .join(" ")}
            type="button"
            disabled={agentHooksInstallState === "installing"}
            onClick={onInstallAgentHooks}
          >
            {agentHooksInstallState === "installed" ? (
              <Check size={13} strokeWidth={2.6} />
            ) : (
              <RefreshCcw size={13} strokeWidth={2.4} />
            )}
            <span>
              {agentHooksInstallState === "installing"
                ? "安装中"
                : agentHooksInstallState === "installed"
                  ? "已安装"
                  : "安装/修复"}
            </span>
          </button>
        </div>
        <div
          className={[
            "agent-status-panel",
            `agent-status-panel--${getAgentVisualState(agentStatus)}`,
          ].join(" ")}
        >
          <div className="agent-status-panel__summary">
            <span>当前状态</span>
            <strong>{agentStatusLabel}</strong>
          </div>
          <div className="agent-status-panel__rows">
            {agentStatusRows.map((row) => (
              <div
                className={[
                  "agent-status-row",
                  row.needsAttention ? "agent-status-row--attention" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                key={row.provider}
              >
                <span>{row.label}</span>
                <strong>{row.phaseLabel}</strong>
                {row.needsAttention ? (
                  <button
                    className="agent-status-clear-button"
                    type="button"
                    disabled={clearingAgentProvider === row.provider}
                    title={`清除 ${row.label} 状态`}
                    aria-label={`清除 ${row.label} 状态`}
                    onClick={() => onClearAgentStatus(row.provider)}
                  >
                    <X size={12} strokeWidth={2.4} />
                    <span>
                      {clearingAgentProvider === row.provider
                        ? "清除中"
                        : "清除状态"}
                    </span>
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        </div>
        {agentHooksInstallState === "installed" && agentHooksInstallResult ? (
          <div className="agent-hooks-status agent-hooks-status--ok">
            <span>脚本目录</span>
            <strong title={agentHooksInstallResult.scriptsDir}>
              {agentHooksInstallResult.scriptsDir}
            </strong>
          </div>
        ) : null}
        {agentHooksInstallState === "error" ? (
          <div className="agent-hooks-status agent-hooks-status--error">
            {agentHooksInstallError}
          </div>
        ) : null}
      </section>

      <section
        className={[
          "settings-section",
          "settings-section--clipboard",
          focusClipboardShortcutToken > 0 ? "settings-section--attention" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        ref={clipboardShortcutPanelRef}
      >
        <div className="settings-section__header">
          <span>剪贴板历史</span>
        </div>
        <ToggleControl
          label="记录剪贴板"
          checked={clipboardSettings.enabled}
          onChange={(enabled) =>
            onClipboardSettingsChange({ ...clipboardSettings, enabled })
          }
        />
        <ToggleControl
          label="记录图片"
          checked={clipboardSettings.captureImages}
          onChange={(captureImages) =>
            onClipboardSettingsChange({ ...clipboardSettings, captureImages })
          }
        />
        <ToggleControl
          label="选择后自动粘贴回原窗口"
          checked={clipboardSettings.autoPaste}
          onChange={(autoPaste) =>
            onClipboardSettingsChange({ ...clipboardSettings, autoPaste })
          }
        />
        <NumberControl
          label="最大历史条数"
          value={clipboardSettings.maxItems}
          min={5}
          max={200}
          onChange={(maxItems) =>
            onClipboardSettingsChange({ ...clipboardSettings, maxItems })
          }
        />
        <div className="shortcut-control">
          <div className="shortcut-control__meta">
            <span>展开快捷键</span>
            <strong>{normalizeClipboardShortcut(clipboardSettings.shortcut)}</strong>
          </div>
          <button
            ref={clipboardShortcutButtonRef}
            className={[
              "shortcut-record-button",
              isRecordingShortcut ? "shortcut-record-button--recording" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            type="button"
            onClick={() => setIsRecordingShortcut(true)}
            onKeyDown={handleShortcutKeyDown}
            onBlur={() => setIsRecordingShortcut(false)}
          >
            <Keyboard size={14} strokeWidth={2.3} />
            <span>
              {isRecordingShortcut
                ? "按下组合键"
                : normalizeClipboardShortcut(clipboardSettings.shortcut)}
            </span>
          </button>
        </div>
      </section>

      <section className="settings-section settings-section--colors">
        <div className="settings-section__header">
          <span>颜色设置</span>
        </div>
        <div className="color-grid">
          <ColorControl
            label="任务/待办字样"
            value={settings.taskTextColor}
            onChange={(taskTextColor) =>
              onSettingsChange({ ...settings, taskTextColor })
            }
          />
          <ColorControl
            label="亮点颜色"
            value={settings.pulseColor}
            onChange={(pulseColor) =>
              onSettingsChange({ ...settings, pulseColor })
            }
          />
          <ColorControl
            label="岛屿背景"
            value={settings.islandBackgroundColor}
            onChange={(islandBackgroundColor) =>
              onSettingsChange({ ...settings, islandBackgroundColor })
            }
          />
          <ColorControl
            label="待办纸张"
            value={settings.todoBackgroundColor}
            onChange={(todoBackgroundColor) =>
              onSettingsChange({ ...settings, todoBackgroundColor })
            }
          />
        </div>
        <SliderControl
          label="亮点亮度"
          value={settings.pulseBrightness}
          min={50}
          max={160}
          step={1}
          suffix="%"
          onChange={(pulseBrightness) =>
            onSettingsChange({ ...settings, pulseBrightness })
          }
        />
      </section>

      <section className="settings-section settings-section--presets">
        <div className="settings-section__header">
          <span>样式预设</span>
          <button
            className="preset-save-button"
            type="button"
            onClick={onSavePreset}
          >
            <Save size={13} strokeWidth={2.2} />
            <span>保存当前</span>
          </button>
        </div>
        {presets.length === 0 ? (
          <div className="preset-empty">还没有样式预设</div>
        ) : (
          <div className="preset-list" role="list">
            {presets.map((preset) => (
              <div
                className={[
                  "preset-item",
                  preset.isDefault ? "preset-item--default" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                key={preset.id}
                role="listitem"
              >
                {editingPresetId === preset.id ? (
                  <input
                    className="preset-name-input"
                    value={presetNameDraft}
                    aria-label="样式预设名称"
                    autoFocus
                    onChange={(event) =>
                      setPresetNameDraft(event.currentTarget.value)
                    }
                    onBlur={commitPresetRename}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        commitPresetRename();
                      }

                      if (event.key === "Escape") {
                        setEditingPresetId(null);
                        setPresetNameDraft("");
                      }
                    }}
                  />
                ) : (
                  <button
                    className="preset-name-button"
                    type="button"
                    title={preset.isDefault ? "默认样式预设" : "重命名样式预设"}
                    disabled={preset.isDefault}
                    onClick={() => {
                      if (!preset.isDefault) {
                        startPresetRename(preset);
                      }
                    }}
                  >
                    {preset.name}
                  </button>
                )}
                <button
                  className="preset-apply-button"
                  type="button"
                  onClick={() => onApplyPreset(preset.id)}
                >
                  启用
                </button>
                {preset.isDefault ? (
                  <span className="preset-delete-spacer" aria-hidden="true" />
                ) : (
                  <button
                    className="preset-delete-button"
                    type="button"
                    title="删除样式预设"
                    aria-label={`删除 ${preset.name}`}
                    onClick={() => onDeletePreset(preset.id)}
                  >
                    <Trash2 size={13} strokeWidth={2.2} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section
        className={[
          "settings-section",
          "settings-section--storage",
          "save-path-panel",
          highlightSavePath ? "save-path-panel--attention" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        ref={savePathPanelRef}
      >
        <div className="settings-section__header save-path-panel__header">
          <span>待办清单保存路径</span>
        </div>
        <div className="save-path-row">
          <label className="save-path-field">
            <span>文件夹</span>
            <input
              ref={savePathInputRef}
              value={saveDirectoryDraft}
              placeholder="D:/Todos"
              aria-label="待办清单 Markdown 保存文件夹"
              onChange={(event) =>
                onSaveDirectoryDraftChange(event.currentTarget.value)
              }
            />
          </label>
          <button
            className={[
              "save-path-button",
              savePathState === "saved" ? "save-path-button--saved" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            type="button"
            onClick={onSaveDirectory}
          >
            {savePathState === "saved" ? (
              <>
                <Check className="save-check-icon" size={15} strokeWidth={2.6} />
                <span>已保存</span>
              </>
            ) : (
              <>
                <Save size={14} strokeWidth={2.2} />
                <span>保存</span>
              </>
            )}
          </button>
        </div>
      </section>
    </div>
  );
}

function TodoNotebook({
  todos,
  dailyNote,
  draft,
  activeTodoId,
  pageMode,
  archives,
  archiveLayout,
  selectedArchive,
  saveState,
  enableTodoReorder,
  onDraftChange,
  onAddTodo,
  onToggleTodo,
  onUpdateTodo,
  onStartTodo,
  onDeleteTodo,
  onReorderTodo,
  onSaveToday,
  onShowArchive,
  onShowDaily,
  onShowToday,
  onDailyNoteChange,
  onArchiveLayoutChange,
  onSelectArchive,
  focusTimer,
  activeTaskTitle,
  onToggleFocusTimer,
  onResetFocusTimer,
  completedFocusSessions,
  quickCaptureToken,
}: {
  todos: TodoItem[];
  dailyNote: string;
  draft: string;
  activeTodoId: string | null;
  pageMode: TodoPageMode;
  archives: TodoArchive[];
  archiveLayout: ArchiveLayout;
  selectedArchive: TodoArchive | null;
  saveState: SaveState;
  enableTodoReorder: boolean;
  onDraftChange: (value: string) => void;
  onAddTodo: () => void;
  onToggleTodo: (id: string) => void;
  onUpdateTodo: (id: string, title: string) => void;
  onStartTodo: (id: string) => void;
  onDeleteTodo: (id: string) => void;
  onReorderTodo: (sourceId: string, targetId: string) => void;
  onSaveToday: () => void;
  onShowArchive: () => void;
  onShowDaily: () => void;
  onShowToday: () => void;
  onDailyNoteChange: (value: string) => void;
  onArchiveLayoutChange: (layout: ArchiveLayout) => void;
  onSelectArchive: (date: string) => void;
  focusTimer: FocusTimerState;
  activeTaskTitle: string | null;
  onToggleFocusTimer: () => void;
  onResetFocusTimer: () => void;
  completedFocusSessions: number;
  quickCaptureToken: number;
}) {
  const displayedTodos =
    pageMode === "review" ? selectedArchive?.todos ?? [] : todos;
  const isTodayMode = pageMode === "today";
  const isDailyMode = pageMode === "daily";
  const isArchiveMode = pageMode === "archive";
  const isReviewMode = pageMode === "review";
  const openCount = displayedTodos.filter((todo) => !todo.completed).length;
  const listClassName = [
    "todo-list",
    displayedTodos.length > TODO_SCROLL_START_ROWS ? "todo-list--scroll" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const inputPlaceholder = pageMode === "today" ? "写下要做的事，按回车添加" : "查看待办记录";
  const archiveTitle = archiveLayout === "cards" ? "卡片视图" : "时间线视图";
  const notebookClassName = [
    "todo-notebook",
    isDailyMode ? "todo-notebook--daily" : "",
    isArchiveMode ? "todo-notebook--archive" : "",
    isReviewMode ? "todo-notebook--review" : "",
    isArchiveMode ? `todo-notebook--archive-${archiveLayout}` : "",
  ]
    .filter(Boolean)
    .join(" ");
  const [editingTodoId, setEditingTodoId] = useState<string | null>(null);
  const [todoTitleDraft, setTodoTitleDraft] = useState("");
  const [draggedTodoId, setDraggedTodoId] = useState<string | null>(null);
  const [dragOverTodoId, setDragOverTodoId] = useState<string | null>(null);
  const quickCaptureInputRef = useRef<HTMLInputElement | null>(null);
  const canReorderTodos = isTodayMode && enableTodoReorder;

  useEffect(() => {
    if (!quickCaptureToken || !isTodayMode) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      quickCaptureInputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [isTodayMode, quickCaptureToken]);

  const startTodoTitleEdit = useCallback((todo: TodoItem) => {
    if (!isTodayMode) {
      return;
    }

    setEditingTodoId(todo.id);
    setTodoTitleDraft(todo.title);
  }, [isTodayMode]);

  const commitTodoTitleEdit = useCallback(() => {
    if (!editingTodoId) {
      return;
    }

    const nextTitle = todoTitleDraft.trim();

    if (nextTitle) {
      onUpdateTodo(editingTodoId, nextTitle);
    }

    setEditingTodoId(null);
    setTodoTitleDraft("");
  }, [editingTodoId, onUpdateTodo, todoTitleDraft]);

  const getTodoIdAtPoint = useCallback((clientX: number, clientY: number) => {
    const element = document.elementFromPoint(clientX, clientY);
    const todoElement = element?.closest("[data-todo-id]");

    return todoElement instanceof HTMLElement
      ? todoElement.dataset.todoId ?? null
      : null;
  }, []);

  const startTodoDrag = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>, todoId: string) => {
      if (!canReorderTodos || editingTodoId === todoId) {
        return;
      }

      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      setDraggedTodoId(todoId);
      setDragOverTodoId(null);
    },
    [canReorderTodos, editingTodoId],
  );

  const moveTodoDrag = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (!draggedTodoId) {
        return;
      }

      event.preventDefault();
      const targetTodoId = getTodoIdAtPoint(event.clientX, event.clientY);
      setDragOverTodoId(
        targetTodoId && targetTodoId !== draggedTodoId ? targetTodoId : null,
      );
    },
    [draggedTodoId, getTodoIdAtPoint],
  );

  const finishTodoDrag = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (!draggedTodoId) {
        return;
      }

      event.preventDefault();
      const targetTodoId =
        dragOverTodoId || getTodoIdAtPoint(event.clientX, event.clientY);

      if (targetTodoId && targetTodoId !== draggedTodoId) {
        onReorderTodo(draggedTodoId, targetTodoId);
      }

      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }

      setDraggedTodoId(null);
      setDragOverTodoId(null);
    },
    [dragOverTodoId, draggedTodoId, getTodoIdAtPoint, onReorderTodo],
  );

  const cancelTodoDrag = useCallback(() => {
    setDraggedTodoId(null);
    setDragOverTodoId(null);
  }, []);

  return (
    <section className={notebookClassName} aria-label="任务清单">
      <div className="todo-notebook__spine">
        <button
          className={[
            "todo-spine-button",
            "todo-spine-button--today",
            isTodayMode || isDailyMode ? "todo-spine-button--active" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          type="button"
          title="今天的待办"
          aria-label="今天的待办"
          onClick={onShowToday}
        />
        <button
          className={[
            "todo-spine-button",
            "todo-spine-button--save",
            saveState === "saved" ? "todo-spine-button--saved" : "",
            saveState === "saving" ? "todo-spine-button--saving" : "",
            saveState === "needs-path" || saveState === "error"
              ? "todo-spine-button--attention"
              : "",
          ]
            .filter(Boolean)
            .join(" ")}
          type="button"
          title="保存今天的待办"
          aria-label="保存今天的待办"
          onClick={onSaveToday}
        >
          {saveState === "saved" && (
            <Check className="save-check-icon" size={12} strokeWidth={3} />
          )}
        </button>
        <button
          className={[
            "todo-spine-button",
            "todo-spine-button--archive",
            pageMode === "archive" || pageMode === "review"
              ? "todo-spine-button--active"
              : "",
          ]
            .filter(Boolean)
            .join(" ")}
          type="button"
          title="查看历史记录"
          aria-label="查看历史记录"
          onClick={onShowArchive}
        />
      </div>

      <div className="todo-notebook__topline">
        <div className="todo-notebook__title-group">
          <span className="todo-notebook__tab">
            {isDailyMode ? (
              <NotebookPen size={15} strokeWidth={2.1} />
            ) : (
              <ClipboardList size={15} strokeWidth={2.1} />
            )}
            {isReviewMode
              ? selectedArchive?.date ?? "历史记录"
              : isDailyMode
                ? "每日记录"
                : "今天的待办"}
          </span>
          {!isArchiveMode && !isReviewMode && (
            <button
              className={[
                "todo-page-toggle",
                isDailyMode ? "todo-page-toggle--active" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              type="button"
              title={isDailyMode ? "返回待办" : "打开每日记录"}
              aria-label={isDailyMode ? "返回待办" : "打开每日记录"}
              onClick={isDailyMode ? onShowToday : onShowDaily}
            >
              {isDailyMode ? (
                <ClipboardList size={14} strokeWidth={2.2} />
              ) : (
                <NotebookPen size={14} strokeWidth={2.2} />
              )}
            </button>
          )}
        </div>
        {isArchiveMode ? (
          <div className="archive-layout-toggle" aria-label={archiveTitle}>
            <button
              className={archiveLayout === "cards" ? "archive-layout-toggle--active" : ""}
              type="button"
              title="卡片视图"
              aria-label="卡片视图"
              onClick={() => onArchiveLayoutChange("cards")}
            >
              <ClipboardList size={14} strokeWidth={2.1} />
            </button>
            <button
              className={archiveLayout === "timeline" ? "archive-layout-toggle--active" : ""}
              type="button"
              title="时间线视图"
              aria-label="时间线视图"
              onClick={() => onArchiveLayoutChange("timeline")}
            >
              <Columns2 size={14} strokeWidth={2.1} />
            </button>
          </div>
        ) : (
          <div className="todo-notebook__focus-tools">
            <span className="todo-notebook__open-count">未完成 {openCount} 项</span>
            <button
              className={[
                "focus-timer-button",
                focusTimer.isRunning ? "focus-timer-button--running" : "",
              ].filter(Boolean).join(" ")}
              type="button"
              disabled={!activeTaskTitle}
              title={activeTaskTitle ? "开始或暂停专注计时" : "先选择一项任务"}
              aria-label={activeTaskTitle ? "开始或暂停专注计时" : "先选择一项任务"}
              onClick={onToggleFocusTimer}
            >
              {formatFocusTime(focusTimer.remainingSeconds)}
            </button>
            <button
              className="focus-timer-reset"
              type="button"
              title="重置专注计时"
              aria-label="重置专注计时"
              onClick={onResetFocusTimer}
            >
              <RefreshCcw size={12} strokeWidth={2.4} />
            </button>
          </div>
        )}
      </div>

      {!isDailyMode && !isArchiveMode && (
        <form
          className="todo-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (isTodayMode) {
              onAddTodo();
            }
          }}
        >
          <Plus size={16} strokeWidth={2.2} aria-hidden="true" />
          <input
            ref={quickCaptureInputRef}
            value={draft}
            disabled={!isTodayMode}
            placeholder={inputPlaceholder}
            aria-label="添加待办，按回车保存"
            onChange={(event) => onDraftChange(event.currentTarget.value)}
          />
        </form>
      )}

      {isArchiveMode ? (
        <ArchiveBrowser
          archives={archives}
          layout={archiveLayout}
          onSelectArchive={onSelectArchive}
        />
      ) : isDailyMode ? (
        <div className="daily-review">
          <div className="daily-review__stats" aria-label="今日回顾">
            <span><strong>{todos.filter((todo) => todo.completed).length}</strong> 已完成</span>
            <span><strong>{todos.filter((todo) => !todo.completed).length}</strong> 未完成</span>
            <span><strong>{completedFocusSessions}</strong> 专注轮次</span>
            <span><strong>{dailyNote.trim() ? "已记录" : "未记录"}</strong> 每日笔记</span>
          </div>
          <textarea
            className="daily-note"
            value={dailyNote}
            placeholder="写下今天的收获、阻碍或明天的第一步..."
            aria-label="每日笔记"
            spellCheck={false}
            onChange={(event) => onDailyNoteChange(event.currentTarget.value)}
          />
        </div>
      ) : (
        <div className={listClassName} role="list">
          {displayedTodos.length === 0 ? (
            <div className="todo-empty">
              {isReviewMode ? "这一天没有记录" : "今天还没有待办，先添加一件吧"}
            </div>
          ) : (
            displayedTodos.map((todo) => {
              const isActive =
                isTodayMode && todo.id === activeTodoId && !todo.completed;
              const titleLineCount = getTodoTitleLineCount(todo.title);

              return (
                <div
                  className={[
                    "todo-item",
                    todo.completed ? "todo-item--done" : "",
                    isActive ? "todo-item--active" : "",
                    canReorderTodos ? "todo-item--reorderable" : "",
                    draggedTodoId === todo.id ? "todo-item--dragging" : "",
                    dragOverTodoId === todo.id ? "todo-item--drag-over" : "",
                    !isTodayMode ? "todo-item--readonly" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  key={todo.id}
                  role="listitem"
                  data-todo-id={todo.id}
                  style={
                    {
                      "--todo-title-min-height": `${titleLineCount * 19}px`,
                    } as CSSProperties
                  }
                >
                  <button
                    className="todo-check"
                    type="button"
                    aria-pressed={todo.completed}
                    disabled={!isTodayMode}
                    title={todo.completed ? "标记未完成" : "完成"}
                    aria-label={`${todo.completed ? "标记未完成" : "完成"}：${
                      todo.title
                    }`}
                    onClick={() => onToggleTodo(todo.id)}
                  >
                    {todo.completed && <Check size={14} strokeWidth={2.5} />}
                  </button>
                  {isTodayMode && editingTodoId === todo.id ? (
                    <input
                      className="todo-title-input"
                      value={todoTitleDraft}
                      aria-label="编辑任务名"
                      autoFocus
                      onChange={(event) =>
                        setTodoTitleDraft(event.currentTarget.value)
                      }
                      onBlur={commitTodoTitleEdit}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          commitTodoTitleEdit();
                        }

                        if (event.key === "Escape") {
                          setEditingTodoId(null);
                          setTodoTitleDraft("");
                        }
                      }}
                    />
                  ) : isTodayMode ? (
                    <button
                      className="todo-title todo-title--editable"
                      type="button"
                      title="编辑任务名"
                      onClick={() => startTodoTitleEdit(todo)}
                    >
                      {todo.title}
                    </button>
                  ) : (
                    <span className="todo-title">{todo.title}</span>
                  )}
                  {isTodayMode && (
                    <>
                      <button
                        className={["todo-start", isActive ? "todo-start--active" : ""]
                          .filter(Boolean)
                          .join(" ")}
                        type="button"
                        title={isActive ? "结束" : "开始"}
                        aria-label={`${isActive ? "结束" : "开始"}：${todo.title}`}
                        disabled={todo.completed}
                        onClick={() => onStartTodo(todo.id)}
                      >
                        <Play size={13} strokeWidth={2.4} />
                        <span>{isActive ? "结束" : "开始"}</span>
                      </button>
                      <button
                        className="todo-delete"
                        type="button"
                        title="删除"
                        aria-label={`删除：${todo.title}`}
                        onClick={() => onDeleteTodo(todo.id)}
                      >
                        <Trash2 size={14} strokeWidth={2.2} />
                      </button>
                      {canReorderTodos && (
                        <button
                          className="todo-drag-handle"
                          type="button"
                          title="拖动排序"
                          aria-label={`拖动排序：${todo.title}`}
                          disabled={editingTodoId === todo.id}
                          onPointerDown={(event) => startTodoDrag(event, todo.id)}
                          onPointerMove={moveTodoDrag}
                          onPointerUp={finishTodoDrag}
                          onPointerCancel={cancelTodoDrag}
                        >
                          <GripVertical size={15} strokeWidth={2.4} />
                        </button>
                      )}
                    </>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </section>
  );
}

function ArchiveBrowser({
  archives,
  layout,
  onSelectArchive,
}: {
  archives: TodoArchive[];
  layout: ArchiveLayout;
  onSelectArchive: (date: string) => void;
}) {
  const handleHorizontalWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (layout !== "cards") {
      return;
    }

    event.preventDefault();
    event.currentTarget.scrollLeft += event.deltaY + event.deltaX;
  };

  if (archives.length === 0) {
    return <div className="todo-empty">还没有保存的记录</div>;
  }

  if (layout === "timeline") {
    return (
      <div className="archive-timeline" role="list">
        {archives.map((archive) => (
          <button
            className="archive-timeline__item"
            key={archive.date}
            type="button"
            role="listitem"
            onClick={() => onSelectArchive(archive.date)}
          >
            <span className="archive-timeline__dot" />
            <span>{archive.date}</span>
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="archive-cards" role="list" onWheel={handleHorizontalWheel}>
      {archives.map((archive) => {
        const previewTodos = archive.todos.slice(0, 3);
        const dateParts = getDisplayDateParts(archive.date);

        return (
          <button
            className="archive-card"
            key={archive.date}
            type="button"
            role="listitem"
            onClick={() => onSelectArchive(archive.date)}
          >
            <span className="archive-card__eyebrow">TODAY</span>
            <strong className="archive-card__date">
              <span>{dateParts.year}</span>
              <span>
                {dateParts.month}
                <em>/</em>
                {dateParts.day}
              </span>
            </strong>
            <span className="archive-card__preview">
              {previewTodos.length > 0 ? (
                previewTodos.map((todo) => (
                  <span className="archive-card__todo" key={todo.id}>
                    <span
                      className={[
                        "archive-card__todo-mark",
                        todo.completed ? "archive-card__todo-mark--done" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    />
                    <span>{todo.title}</span>
                  </span>
                ))
              ) : (
                <span className="archive-card__empty">No tasks</span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function MusicPlayerPanel({
  mediaState,
  lyricsState,
  showLyrics,
  playbackPositionSeconds,
  isTrackChanging,
  commandError,
  onPlayPause,
  onNext,
  onPrevious,
}: {
  mediaState: MediaState;
  lyricsState: LyricsState;
  showLyrics: boolean;
  playbackPositionSeconds: number;
  isTrackChanging: boolean;
  commandError: string | null;
  onPlayPause: () => void;
  onNext: () => void;
  onPrevious: () => void;
}) {
  const isPlaying = mediaState.playbackStatus === "playing";
  const isPaused = mediaState.playbackStatus === "paused";
  const hasAudioSignal = mediaState.available || mediaState.audioActive;
  const statusLabel = commandError
    ? "控制失败"
    : isPaused
      ? "已暂停"
      : isPlaying
        ? "正在播放"
        : "暂无媒体";
  const peakPercent = Math.round(
    clamp(Math.log1p(mediaState.audioPeak * 160) / Math.log1p(160), 0, 1) *
      100,
  );
  const lyricLines = useMemo(() => parseLyrics(lyricsState.text), [lyricsState.text]);
  const activeLyricIndex = getActiveLyricIndex(
    lyricLines,
    playbackPositionSeconds,
  );
  const activeLyricRef = useRef<HTMLParagraphElement | null>(null);

  useEffect(() => {
    activeLyricRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [activeLyricIndex]);

  return (
    <section
      className={[
        "music-player",
        hasAudioSignal ? "" : "music-player--empty",
        isPaused ? "music-player--paused" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label="音乐播放器"
      title={commandError ?? undefined}
    >
      <div className="music-player__signal">
        <div className="music-player__status">
          <span className="music-player__track" aria-live="polite">
            <strong title={mediaState.trackTitle || statusLabel}>
              {mediaState.trackTitle || statusLabel}
            </strong>
            {mediaState.trackTitle ? (
              <em>{mediaState.trackArtist || statusLabel}</em>
            ) : null}
          </span>
          <span className="music-player__metrics">
            <strong>{formatPlaybackTime(playbackPositionSeconds)}</strong>
            <em>{peakPercent}%</em>
          </span>
        </div>
        <MusicLevelWave
          isAvailable={hasAudioSignal}
          isPlaying={isPlaying}
          audioPeak={mediaState.audioPeak}
        />
        {showLyrics && hasAudioSignal ? (
          <div className="music-player__lyrics" aria-live="polite">
            {lyricsState.status === "missing-metadata" ? (
              <span>播放器未提供歌曲名，无法查找歌词</span>
            ) : lyricsState.status === "loading" ? (
              <span>正在查找歌词…</span>
            ) : lyricsState.status === "ready" ? (
              lyricLines.length > 0 ? (
                <div className="music-player__lyric-lines">
                  {lyricLines.map((line, index) => (
                    <p
                      className={index === activeLyricIndex ? "music-player__lyric-line--active" : ""}
                      key={`${line.time ?? "plain"}-${index}`}
                      ref={index === activeLyricIndex ? activeLyricRef : undefined}
                    >
                      {line.text}
                    </p>
                  ))}
                </div>
              ) : (
                <span>歌词内容为空</span>
              )
            ) : lyricsState.status === "empty" ? (
              <span>在线曲库暂未收录这首歌的歌词</span>
            ) : lyricsState.status === "error" ? (
              <span>歌词暂时不可用</span>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="music-player__controls">
        <button
          className="music-control-button"
          type="button"
          title="上一首"
          aria-label="上一首"
          onClick={onPrevious}
        >
          <SkipBack size={18} strokeWidth={2.4} />
        </button>
        <button
          className="music-control-button music-control-button--primary"
          type="button"
          title={isPlaying ? "暂停" : "播放"}
          aria-label={isPlaying ? "暂停" : "播放"}
          aria-busy={isTrackChanging}
          onClick={onPlayPause}
        >
          {isTrackChanging ? (
            <RefreshCcw
              className="music-control-button__track-change"
              size={19}
              strokeWidth={2.4}
            />
          ) : isPlaying ? (
            <Pause size={20} strokeWidth={2.5} />
          ) : (
            <Play size={20} strokeWidth={2.5} />
          )}
        </button>
        <button
          className="music-control-button"
          type="button"
          title="下一首"
          aria-label="下一首"
          onClick={onNext}
        >
          <SkipForward size={18} strokeWidth={2.4} />
        </button>
      </div>
    </section>
  );
}

function ExternalNotificationPanel({
  notification,
  history,
  onSelect,
  onOpenAction,
  onTogglePinned,
  onDelete,
  onClear,
}: {
  notification: WindowsNotificationEvent | null;
  history: WindowsNotificationEvent[];
  onSelect: (notification: WindowsNotificationEvent) => void;
  onOpenAction: (url: string) => void;
  onTogglePinned: (notification: WindowsNotificationEvent) => void;
  onDelete: (notification: WindowsNotificationEvent) => void;
  onClear: () => void;
}) {
  const [mediaFailed, setMediaFailed] = useState(false);
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<"all" | "text" | "voice" | "image" | "video">("all");

  useEffect(() => setMediaFailed(false), [notification?.receivedAt]);

  const filteredHistory = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return [...history]
      .filter((item) => kindFilter === "all" || item.kind === kindFilter)
      .filter((item) => {
        if (!normalizedQuery) return true;
        return [item.title, item.content, item.source]
          .filter(Boolean)
          .join(" ")
          .toLocaleLowerCase()
          .includes(normalizedQuery);
      })
      .sort((left, right) => Number(Boolean(right.pinned)) - Number(Boolean(left.pinned)) || right.receivedAt - left.receivedAt);
  }, [history, kindFilter, query]);

  if (!notification) {
    return (
      <section className="external-notification-panel" aria-label="接口扩展记录">
        <div className="external-notification-panel__empty">
          <MessageSquareText size={22} strokeWidth={1.8} />
          <strong>还没有接口扩展消息</strong>
          <span>外部程序发送到本机接口的内容会保存在这里。</span>
        </div>
      </section>

    );
  }

  const kind = notification?.kind ?? "text";
  const title = notification?.title?.trim() || "外部消息";
  const content = notification?.content?.trim() || notification?.source || "暂无内容";
  const mediaUrl = notification?.mediaUrl?.trim() ?? "";
  const isImage = kind === "image" && isDisplayableImageUrl(mediaUrl);
  const isVideo = kind === "video" && /^https?:\/\//i.test(mediaUrl);
  const isVoice = kind === "voice" && /^https?:\/\//i.test(mediaUrl);
  const typeLabel = kind === "image" ? "图片消息" : kind === "video" ? "视频消息" : kind === "voice" ? "语音消息" : "文字消息";
  const TypeIcon = kind === "image" ? ImageIcon : kind === "video" ? Video : kind === "voice" ? Mic : MessageSquareText;

  return (
    <section className="external-notification-panel" aria-label="外部消息详情">
      <header className="external-notification-panel__header">
        <span className="external-notification-panel__type">
          <TypeIcon size={15} strokeWidth={2.2} />
          {typeLabel}
        </span>
        <time>{notification ? new Date(notification.receivedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }) : ""}</time>
      </header>
      <div className="external-notification-panel__tools">
        <label className="external-notification-panel__search">
          <Search size={13} strokeWidth={2.3} />
          <input value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder="搜索记录" />
        </label>
        <select value={kindFilter} onChange={(event) => setKindFilter(event.currentTarget.value as typeof kindFilter)} aria-label="筛选消息类型">
          <option value="all">全部</option>
          <option value="text">文字</option>
          <option value="image">图片</option>
          <option value="video">视频</option>
          <option value="voice">语音</option>
        </select>
        <button className="external-notification-panel__tool-button" type="button" title={notification.pinned ? "取消固定" : "固定消息"} onClick={() => onTogglePinned(notification)}>
          <Pin size={14} strokeWidth={2.3} fill={notification.pinned ? "currentColor" : "none"} />
        </button>
        <button className="external-notification-panel__tool-button" type="button" title="清空接口记录" onClick={onClear}>
          <Trash2 size={14} strokeWidth={2.3} />
        </button>
        <button className="external-notification-panel__tool-button" type="button" title="删除当前消息" onClick={() => onDelete(notification)}>
          <X size={14} strokeWidth={2.3} />
        </button>
      </div>
      <div className="external-notification-panel__body">
        <h2>{title}</h2>
        {isImage && !mediaFailed ? (
          <img className="external-notification-panel__image" src={mediaUrl} alt={content} onError={() => setMediaFailed(true)} />
        ) : isVideo ? (
          <video className="external-notification-panel__video" controls preload="metadata" src={mediaUrl} onError={() => setMediaFailed(true)}>
            当前视频无法播放。
          </video>
        ) : isVoice ? (
          <audio className="external-notification-panel__audio" controls preload="metadata" src={mediaUrl} onError={() => setMediaFailed(true)}>
            当前语音无法播放。
          </audio>
        ) : null}
        {mediaFailed ? <span className="external-notification-panel__media-error">媒体地址无法加载，请检查链接或来源限制。</span> : null}
        <p>{content}</p>
        {notification?.actionUrl ? (
          <button
            className="external-notification-panel__action"
            type="button"
            onClick={() => onOpenAction(notification.actionUrl!)}
          >
            <ExternalLink size={14} strokeWidth={2.3} />
            打开链接
          </button>
        ) : null}
      </div>
      {filteredHistory.length > 0 ? (
        <div className="external-notification-panel__history" aria-label="接口扩展记录">
          {filteredHistory.map((item) => (
            <button
              className={item.notificationId === notification?.notificationId && item.receivedAt === notification?.receivedAt ? "external-notification-panel__history-item external-notification-panel__history-item--active" : "external-notification-panel__history-item"}
              type="button"
              key={`${item.notificationId}-${item.receivedAt}`}
              title={item.source}
              onClick={() => onSelect(item)}
            >
              {item.pinned ? "📌 " : ""}{item.title?.trim() || "未命名消息"}
            </button>
          ))}
        </div>
      ) : <div className="external-notification-panel__history-empty">没有符合条件的记录</div>}
    </section>
  );
}

function MusicLevelWave({
  isAvailable,
  isPlaying,
  audioPeak,
}: {
  isAvailable: boolean;
  isPlaying: boolean;
  audioPeak: number;
}) {
  const [phase, setPhase] = useState(0);
  const prefersReducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    if (!isPlaying) {
      setPhase(0);
      return;
    }

    const interval = window.setInterval(
      () => {
        setPhase(performance.now() / (isPlaying ? 210 : 760));
      },
      prefersReducedMotion ? 460 : isPlaying ? 58 : 150,
    );

    return () => window.clearInterval(interval);
  }, [isAvailable, isPlaying, prefersReducedMotion]);

  const liftedPeak = isPlaying
    ? clamp(Math.log1p(clamp(audioPeak, 0, 1) * 185) / Math.log1p(185), 0, 1)
    : 0;
  const bars = [0.22, 0.48, 0.78, 0.54, 0.92, 0.68, 0.4, 0.72, 0.34].map(
    (bar, index) => {
      if (!isPlaying) {
        return 0.2;
      }

      const floor = isAvailable ? 0.2 : 0.14 + bar * 0.2;
      const breath =
        isAvailable && !prefersReducedMotion
          ? 0.06 + Math.sin(phase + index * 0.72) * 0.045
          : 0;
      const movement =
        liftedPeak *
        (0.34 + bar * 1.06) *
        (0.78 + Math.sin(phase * (1.05 + index * 0.05) + index * 1.35) * 0.28);

      return clamp(floor + breath + movement, 0.14, 1.08);
    },
  );

  return (
    <div className="music-player__wave" aria-hidden="true">
      {bars.map((scale, index) => (
        <span
          key={index}
          style={
            {
              "--wave-scale": scale.toFixed(3),
              "--wave-opacity": (0.46 + scale * 0.46).toFixed(3),
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}

function ClipboardHistoryPanel({
  snapshot,
  onCopyItem,
  onToggleFavorite,
  onUpdateNote,
  onDeleteItem,
  onClear,
}: {
  snapshot: ClipboardHistorySnapshot;
  onCopyItem: (id: string) => Promise<boolean> | boolean;
  onToggleFavorite: (id: string) => Promise<void> | void;
  onUpdateNote: (id: string, note: string) => Promise<boolean> | boolean;
  onDeleteItem: (id: string) => Promise<void> | void;
  onClear: () => Promise<void> | void;
}) {
  const [query, setQuery] = useState("");
  const [clipboardView, setClipboardView] = useState<"all" | "favorites">("all");
  const [copiedItemId, setCopiedItemId] = useState<string | null>(null);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [isConfirmingClear, setIsConfirmingClear] = useState(false);
  const copiedResetRef = useRef<number | null>(null);
  const confirmDeleteResetRef = useRef<number | null>(null);
  const confirmClearResetRef = useRef<number | null>(null);
  const itemElementsRef = useRef<Map<string, HTMLElement>>(new Map());
  const itemPositionsRef = useRef<Map<string, DOMRect>>(new Map());
  const normalizedQuery = query.trim().toLowerCase();
  const favoriteItems = useMemo(
    () => snapshot.items.filter((item) => item.favorite),
    [snapshot.items],
  );
  const viewedItems = clipboardView === "favorites" ? favoriteItems : snapshot.items;
  const filteredItems = useMemo(() => {
    if (!normalizedQuery) {
      return viewedItems;
    }

    return viewedItems.filter((item) => {
      const haystack = [
        item.preview,
        item.text ?? "",
        item.note ?? "",
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedQuery);
    });
  }, [normalizedQuery, viewedItems]);

  useEffect(
    () => () => {
      if (copiedResetRef.current !== null) {
        window.clearTimeout(copiedResetRef.current);
      }

      if (confirmDeleteResetRef.current !== null) {
        window.clearTimeout(confirmDeleteResetRef.current);
      }

      if (confirmClearResetRef.current !== null) {
        window.clearTimeout(confirmClearResetRef.current);
      }
    },
    [],
  );

  useLayoutEffect(() => {
    const visibleIds = new Set(filteredItems.map((item) => item.id));
    const nextPositions = new Map<string, DOMRect>();
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    itemElementsRef.current.forEach((element, id) => {
      if (!visibleIds.has(id)) {
        return;
      }

      const nextRect = element.getBoundingClientRect();
      const previousRect = itemPositionsRef.current.get(id);
      nextPositions.set(id, nextRect);

      if (!previousRect || prefersReducedMotion) {
        return;
      }

      const deltaX = previousRect.left - nextRect.left;
      const deltaY = previousRect.top - nextRect.top;

      if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) {
        return;
      }

      element.getAnimations().forEach((animation) => animation.cancel());
      element.animate(
        [
          { transform: `translate(${deltaX}px, ${deltaY}px)` },
          { transform: "translate(0, 0)" },
        ],
        {
          duration: 280,
          easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
        },
      );
    });

    itemPositionsRef.current = nextPositions;
  }, [filteredItems]);

  useEffect(() => {
    if (confirmDeleteResetRef.current !== null) {
      window.clearTimeout(confirmDeleteResetRef.current);
      confirmDeleteResetRef.current = null;
    }

    if (!confirmDeleteId) {
      return;
    }

    confirmDeleteResetRef.current = window.setTimeout(() => {
      setConfirmDeleteId(null);
      confirmDeleteResetRef.current = null;
    }, 3000);

    return () => {
      if (confirmDeleteResetRef.current !== null) {
        window.clearTimeout(confirmDeleteResetRef.current);
        confirmDeleteResetRef.current = null;
      }
    };
  }, [confirmDeleteId]);

  useEffect(() => {
    if (confirmClearResetRef.current !== null) {
      window.clearTimeout(confirmClearResetRef.current);
      confirmClearResetRef.current = null;
    }

    if (!isConfirmingClear) {
      return;
    }

    confirmClearResetRef.current = window.setTimeout(() => {
      setIsConfirmingClear(false);
      confirmClearResetRef.current = null;
    }, 3000);

    return () => {
      if (confirmClearResetRef.current !== null) {
        window.clearTimeout(confirmClearResetRef.current);
        confirmClearResetRef.current = null;
      }
    };
  }, [isConfirmingClear]);

  useEffect(() => {
    if (!confirmDeleteId && !isConfirmingClear) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const isConfirmControl = event
        .composedPath()
        .some(
          (node) =>
            node instanceof Element &&
            node.matches("[data-clipboard-confirm-control='true']"),
        );

      if (isConfirmControl) {
        return;
      }

      setConfirmDeleteId(null);
      setIsConfirmingClear(false);
    };

    document.addEventListener("pointerdown", handlePointerDown, true);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
    };
  }, [confirmDeleteId, isConfirmingClear]);

  useEffect(() => {
    if (
      confirmDeleteId &&
      !snapshot.items.some((item) => item.id === confirmDeleteId)
    ) {
      setConfirmDeleteId(null);
    }

    if (snapshot.items.length === 0) {
      setIsConfirmingClear(false);
    }

    if (
      editingNoteId &&
      !snapshot.items.some((item) => item.id === editingNoteId)
    ) {
      setEditingNoteId(null);
      setNoteDraft("");
      setIsSavingNote(false);
    }
  }, [confirmDeleteId, editingNoteId, snapshot.items]);

  const showCopiedState = useCallback((id: string) => {
    setCopiedItemId(id);

    if (copiedResetRef.current !== null) {
      window.clearTimeout(copiedResetRef.current);
    }

    copiedResetRef.current = window.setTimeout(() => {
      setCopiedItemId(null);
      copiedResetRef.current = null;
    }, 1100);
  }, []);

  const handleCopyItem = useCallback(
    (id: string) => {
      void Promise.resolve(onCopyItem(id)).then((didCopy) => {
        if (didCopy) {
          showCopiedState(id);
        }
      });
    },
    [onCopyItem, showCopiedState],
  );

  const handleToggleFavorite = useCallback(
    (id: string) => {
      setConfirmDeleteId(null);
      void Promise.resolve(onToggleFavorite(id));
    },
    [onToggleFavorite],
  );

  const startEditingNote = useCallback((item: ClipboardHistoryItem) => {
    setConfirmDeleteId(null);
    setEditingNoteId(item.id);
    setNoteDraft(item.note ?? "");
  }, []);

  const cancelEditingNote = useCallback(() => {
    if (isSavingNote) {
      return;
    }

    setEditingNoteId(null);
    setNoteDraft("");
  }, [isSavingNote]);

  const saveNote = useCallback(
    (id: string) => {
      if (isSavingNote) {
        return;
      }

      setIsSavingNote(true);
      void Promise.resolve(onUpdateNote(id, noteDraft)).then((didSave) => {
        setIsSavingNote(false);
        if (didSave) {
          setEditingNoteId(null);
          setNoteDraft("");
        }
      });
    },
    [isSavingNote, noteDraft, onUpdateNote],
  );

  const handleDeleteItem = useCallback(
    (id: string) => {
      if (confirmDeleteId !== id) {
        setIsConfirmingClear(false);
        setConfirmDeleteId(id);
        return;
      }

      setConfirmDeleteId(null);
      setIsConfirmingClear(false);
      void Promise.resolve(onDeleteItem(id));
    },
    [confirmDeleteId, onDeleteItem],
  );

  const handleClear = useCallback(() => {
    if (!isConfirmingClear) {
      setConfirmDeleteId(null);
      setIsConfirmingClear(true);
      return;
    }

    setIsConfirmingClear(false);
    setConfirmDeleteId(null);
    void Promise.resolve(onClear());
  }, [isConfirmingClear, onClear]);

  return (
    <section className="clipboard-panel" aria-label="剪贴板历史">
      <header className="clipboard-panel__header">
        <div className="clipboard-panel__title">
          <ClipboardList size={16} strokeWidth={2.2} />
          <span>剪贴板历史</span>
          <strong>{snapshot.items.length}</strong>
          {favoriteItems.length > 0 && (
            <em aria-label={`${favoriteItems.length} 条收藏`}>
              <Star size={10} strokeWidth={2.4} fill="currentColor" />
              {favoriteItems.length}
            </em>
          )}
        </div>
        <div className="clipboard-panel__tools">
          <span className="clipboard-shortcut-display" aria-label="展开快捷键">
            <Keyboard size={14} strokeWidth={2.3} />
            <span>{normalizeClipboardShortcut(snapshot.settings.shortcut)}</span>
          </span>
          <button
            className={[
              "clipboard-clear-button",
              isConfirmingClear ? "clipboard-clear-button--confirming" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            type="button"
            disabled={snapshot.items.length === 0}
            title={isConfirmingClear ? "确认清空" : "清空"}
            aria-label={isConfirmingClear ? "确认清空" : "清空剪贴板历史"}
            onClick={handleClear}
            data-clipboard-confirm-control="true"
          >
            {isConfirmingClear ? (
              <Check className="save-check-icon" size={14} strokeWidth={2.7} />
            ) : (
              <Trash2 size={14} strokeWidth={2.2} />
            )}
          </button>
        </div>
      </header>

      <div className="clipboard-segments" aria-label="剪贴板栏目">
        <button
          className={clipboardView === "all" ? "clipboard-segment--active" : ""}
          type="button"
          aria-pressed={clipboardView === "all"}
          onClick={() => setClipboardView("all")}
        >
          全部
        </button>
        <button
          className={clipboardView === "favorites" ? "clipboard-segment--active" : ""}
          type="button"
          aria-pressed={clipboardView === "favorites"}
          onClick={() => setClipboardView("favorites")}
        >
          收藏
        </button>
      </div>

      <label className="clipboard-search">
        <Search size={15} strokeWidth={2.2} />
        <input
          value={query}
          placeholder="搜索内容或备注"
          aria-label="搜索剪贴板内容或备注"
          onChange={(event) => setQuery(event.currentTarget.value)}
        />
        {query && (
          <button
            type="button"
            title="清除搜索"
            aria-label="清除搜索"
            onClick={() => setQuery("")}
          >
            <X size={14} strokeWidth={2.4} />
          </button>
        )}
      </label>

      <div className="clipboard-list" role="list">
        {filteredItems.length === 0 ? (
          <div className="clipboard-empty">
            {snapshot.items.length === 0
              ? "复制文本或图片后会出现在这里"
              : clipboardView === "favorites" && favoriteItems.length === 0
                ? "还没有收藏剪贴记录"
                : "没有匹配的剪贴记录"}
          </div>
        ) : (
          filteredItems.map((item) => (
            <article
              className="clipboard-item"
              key={item.id}
              role="listitem"
              ref={(node) => {
                if (node) {
                  itemElementsRef.current.set(item.id, node);
                } else {
                  itemElementsRef.current.delete(item.id);
                }
              }}
            >
              <button
                className="clipboard-item__main"
                type="button"
                title="复制回剪贴板"
                onClick={() => handleCopyItem(item.id)}
              >
                {item.kind === "image" ? (
                  <span className="clipboard-item__thumb">
                    {item.image?.thumbnailDataUrl ? (
                      <img src={item.image.thumbnailDataUrl} alt="" />
                    ) : (
                      <ImageIcon size={20} strokeWidth={2.1} />
                    )}
                  </span>
                ) : (
                  <span className="clipboard-item__text-icon">
                    <ClipboardList size={17} strokeWidth={2.1} />
                  </span>
                )}
                <span className="clipboard-item__body">
                  <span className="clipboard-item__preview">{item.preview}</span>
                </span>
              </button>
              <div className="clipboard-item__note">
                {editingNoteId === item.id ? (
                  <form
                    className="clipboard-note-editor"
                    onSubmit={(event) => {
                      event.preventDefault();
                      saveNote(item.id);
                    }}
                  >
                    <input
                      autoFocus
                      value={noteDraft}
                      maxLength={80}
                      placeholder="备注这是什么"
                      aria-label="剪贴记录备注"
                      disabled={isSavingNote}
                      onChange={(event) => setNoteDraft(event.currentTarget.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Escape") {
                          event.preventDefault();
                          cancelEditingNote();
                        }
                      }}
                    />
                    <button
                      type="submit"
                      title="保存备注"
                      aria-label="保存备注"
                      disabled={isSavingNote}
                    >
                      <Check size={13} strokeWidth={2.6} />
                    </button>
                    <button
                      type="button"
                      title="取消编辑"
                      aria-label="取消编辑备注"
                      disabled={isSavingNote}
                      onClick={cancelEditingNote}
                    >
                      <X size={13} strokeWidth={2.5} />
                    </button>
                  </form>
                ) : (
                  <button
                    className={item.note ? "clipboard-note clipboard-note--filled" : "clipboard-note"}
                    type="button"
                    title={item.note ? `编辑备注：${item.note}` : "添加备注"}
                    aria-label={item.note ? `编辑备注：${item.note}` : "添加剪贴记录备注"}
                    onClick={() => startEditingNote(item)}
                  >
                    <Pencil size={12} strokeWidth={2.3} />
                    <span>{item.note || "备注"}</span>
                  </button>
                )}
              </div>
              <div className="clipboard-item__actions">
                <button
                  className={[
                    "clipboard-favorite-button",
                    item.favorite ? "clipboard-favorite-button--active" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  type="button"
                  title={item.favorite ? "取消收藏" : "收藏"}
                  aria-label={item.favorite ? "取消收藏剪贴记录" : "收藏剪贴记录"}
                  aria-pressed={item.favorite}
                  onClick={() => handleToggleFavorite(item.id)}
                >
                  <Star
                    size={14}
                    strokeWidth={2.3}
                    fill={item.favorite ? "currentColor" : "none"}
                  />
                </button>
                <button
                  className={[
                    "clipboard-delete-button",
                    confirmDeleteId === item.id ? "clipboard-delete-button--confirming" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  type="button"
                  title={confirmDeleteId === item.id ? "确认删除" : "删除"}
                  aria-label="删除剪贴记录"
                  onClick={() => handleDeleteItem(item.id)}
                  data-clipboard-confirm-control="true"
                >
                  {confirmDeleteId === item.id ? (
                    <Check className="save-check-icon" size={14} strokeWidth={2.7} />
                  ) : (
                    <Trash2 size={14} strokeWidth={2.3} />
                  )}
                </button>
                <button
                  className={[
                    "clipboard-copy-button",
                    copiedItemId === item.id ? "clipboard-copy-button--copied" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  type="button"
                  title={copiedItemId === item.id ? "已复制" : "复制"}
                  aria-label="复制回剪贴板"
                  onClick={() => handleCopyItem(item.id)}
                >
                  {copiedItemId === item.id ? (
                    <Check className="save-check-icon" size={14} strokeWidth={2.7} />
                  ) : (
                    <Copy size={14} strokeWidth={2.3} />
                  )}
                </button>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}

function App() {
  const [mode, setMode] = useState<IslandMode>("collapsed");
  const [isTucked, setIsTucked] = useState(false);
  const [page, setPage] = useState<IslandPage>("todo");
  const [isDocumentVisible, setIsDocumentVisible] = useState(
    () => !document.hidden,
  );
  const [mediaState, setMediaState] =
    useState<MediaState>(DEFAULT_MEDIA_STATE);
  const [latestWindowsNotification, setLatestWindowsNotification] =
    useState<WindowsNotificationEvent | null>(null);
  const [notificationDetail, setNotificationDetail] =
    useState<WindowsNotificationEvent | null>(null);
  const [externalNotificationHistory, setExternalNotificationHistory] =
    useState<WindowsNotificationEvent[]>(loadExternalNotificationHistory);
  const [playbackClock, setPlaybackClock] = useState(() => Date.now());
  const [lyricsState, setLyricsState] = useState<LyricsState>({
    status: "idle",
    text: "",
  });
  const lyricsCache = useRef(new Map<string, string>());
  const [isMediaTrackChanging, setIsMediaTrackChanging] = useState(false);
  const [mediaCommandError, setMediaCommandError] = useState<string | null>(
    null,
  );
  const [agentStatus, setAgentStatus] =
    useState<AgentStatusSnapshot>(DEFAULT_AGENT_STATUS);
  const isRefreshingAgentStatus = useRef(false);
  const isRefreshingMediaState = useRef(false);
  const isRefreshingAudioLevel = useRef(false);
  const isRunningMediaCommand = useRef(false);
  const mediaPlaybackIntent = useRef<{
    status: MediaPlaybackStatus;
    expiresAt: number;
  } | null>(null);
  const [settings, setSettings] = useState<IslandSettings>(loadSettings);
  const [focusTimer, setFocusTimer] = useState<FocusTimerState>(loadFocusTimer);
  const [focusCompletionNotice, setFocusCompletionNotice] = useState(false);
  const [nativeGlassState, setNativeGlassState] =
    useState<NativeGlassState>("disabled");
  const [launchAtStartup, setLaunchAtStartup] = useState(false);
  const [settingPresets, setSettingPresets] =
    useState<IslandPreset[]>(loadSettingPresets);
  const [todos, setTodos] = useState<TodoItem[]>(loadTodos);
  const [dailyNote, setDailyNote] = useState(loadDailyNote);
  const [draftTodo, setDraftTodo] = useState("");
  const [activeTodoId, setActiveTodoId] = useState<string | null>(
    loadActiveTodoId,
  );
  const [currentTodoDate, setCurrentTodoDate] =
    useState<string>(loadCurrentTodoDate);
  const [archives, setArchives] = useState<TodoArchive[]>(loadTodoArchives);
  const [todoPageMode, setTodoPageMode] = useState<TodoPageMode>("today");
  const [archiveLayout, setArchiveLayout] = useState<ArchiveLayout>("cards");
  const [selectedArchiveDate, setSelectedArchiveDate] = useState<string | null>(
    null,
  );
  const [saveDirectory, setSaveDirectory] = useState(loadSaveDirectory);
  const [saveDirectoryDraft, setSaveDirectoryDraft] =
    useState(loadSaveDirectory);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [savePathState, setSavePathState] = useState<SavePathState>("idle");
  const [clipboardHistory, setClipboardHistory] =
    useState<ClipboardHistorySnapshot>(DEFAULT_CLIPBOARD_HISTORY);
  const [agentHooksInstallState, setAgentHooksInstallState] =
    useState<AgentHooksInstallState>("idle");
  const [agentHooksInstallResult, setAgentHooksInstallResult] =
    useState<AgentHooksInstallResult | null>(null);
  const [agentHooksInstallError, setAgentHooksInstallError] = useState("");
  const [clearingAgentProvider, setClearingAgentProvider] =
    useState<AgentProvider | null>(null);
  const [focusClipboardShortcutToken, setFocusClipboardShortcutToken] =
    useState(0);
  const [quickCaptureToken, setQuickCaptureToken] = useState(0);
  const clipboardShortcutToggleAt = useRef(0);
  const shouldInitializeDefaultSaveDirectory = useRef(
    window.localStorage.getItem(TODO_SAVE_DIRECTORY_STORAGE_KEY) === null,
  );
  const defaultSaveDirectoryRequestInFlight = useRef(false);
  const autoSaveTimer = useRef<number | null>(null);
  const autoSaveRequestId = useRef(0);
  const saveStateResetTimer = useRef<number | null>(null);
  const didHydrateAutoSave = useRef(false);
  const didCheckDate = useRef(false);
  const didShowInitialWindow = useRef(false);
  const islandPositionRef = useRef<IslandPosition | null>(loadIslandPosition());
  const selectedArchive =
    archives.find((archive) => archive.date === selectedArchiveDate) ?? null;
  const activeTaskTitle = useMemo(() => {
    const activeTodo = todos.find(
      (todo) => todo.id === activeTodoId && !todo.completed,
    );

    return activeTodo?.title ?? null;
  }, [activeTodoId, todos]);
  const openTodoCount = useMemo(
    () => todos.filter((todo) => !todo.completed).length,
    [todos],
  );
  const lyricLines = useMemo(() => parseLyrics(lyricsState.text), [lyricsState.text]);
  const playbackPositionSeconds = mediaState.playbackStatus === "playing"
    ? mediaState.playbackPositionSeconds + Math.max(0, playbackClock - mediaState.updatedAt) / 1_000
    : mediaState.playbackPositionSeconds;
  const activeLyricIndex = getActiveLyricIndex(lyricLines, playbackPositionSeconds);
  const activeLyricText = activeLyricIndex >= 0
    ? lyricLines[activeLyricIndex]?.text ?? ""
    : "";
  const isShowingNotification = Boolean(latestWindowsNotification?.source);
  const isShowingMedia =
    !isShowingNotification &&
    settings.collapsedContentMode === "auto" &&
    mediaState.playbackStatus === "playing";
  const collapsedContent = isShowingNotification
    ? (latestWindowsNotification?.source ?? "").slice(0, 72)
    : focusCompletionNotice
    ? "专注完成，休息一下再出发。"
    : isShowingMedia
    ? activeLyricText || mediaState.trackTitle || "媒体正在播放"
    : settings.motivationQuote || activeTaskTitle || `剩余${openTodoCount}个待办`;
  const collapsedIslandWidth = useMemo(
    () =>
      isShowingMedia
        ? settings.collapsedMinWidth
        : getCollapsedIslandWidth(collapsedContent, settings.collapsedMinWidth),
    [collapsedContent, isShowingMedia, settings.collapsedMinWidth],
  );
  const isTodoArchivePage =
    page === "todo" && (todoPageMode === "archive" || todoPageMode === "review");
  const visibleTodoRows = Math.min(
    Math.max(
      todoPageMode === "daily" || isTodoArchivePage
        ? TODO_GROW_START_ROWS
        : getTodoVisualRows(todos),
      1,
    ),
    TODO_SCROLL_START_ROWS,
  );
  const expandedIslandHeight =
    page === "todo"
      ? isTodoArchivePage
        ? TODO_ARCHIVE_EXPANDED_ISLAND_HEIGHT
        : BASE_EXPANDED_ISLAND_HEIGHT +
          Math.max(0, visibleTodoRows - TODO_GROW_START_ROWS) * TODO_ROW_HEIGHT
      : page === "music"
        ? MUSIC_EXPANDED_ISLAND_HEIGHT
        : page === "notification"
          ? 430
        : page === "clipboard"
          ? CLIPBOARD_EXPANDED_ISLAND_HEIGHT
          : EDITOR_EXPANDED_ISLAND_HEIGHT;
  const isIslandActive = isDocumentVisible && !isTucked;
  const shouldMonitorAudio =
    isIslandActive &&
    (page === "music" || mediaState.playbackStatus === "playing");
  const layoutSync = useRef<{
    frame: number | null;
    inFlight: boolean;
    pending: IslandSettings;
    active: IslandSettings;
  }>({
    frame: null,
    inFlight: false,
    pending: settings,
    active: settings,
  });

  const stageStyle = useMemo(
    () => {
      const glassStrength = settings.glassIntensity / 100;
      const glassMaskOpacity =
        (settings.opacity / 100) * (0.16 + glassStrength * 0.18);
      const motionIntensity = settings.motionIntensity / 100;
      const transitionDuration = 560 - settings.transitionSpeed * 3.8;
      const edgeGlow = settings.edgeGlow / 100;
      const shadowDepth = settings.shadowDepth / 100;

      return ({
        "--island-opacity": settings.opacity / 100,
        "--island-scale": settings.sizeScale,
        "--collapsed-island-width": `${collapsedIslandWidth}px`,
        "--expanded-island-height": `${expandedIslandHeight}px`,
        "--task-text-color": settings.taskTextColor,
        "--island-pulse-color": settings.pulseColor,
        "--island-pulse-glow-color": hexToRgba(settings.pulseColor, 0.72),
        "--island-pulse-brightness": `${settings.pulseBrightness}%`,
        "--island-background-color": settings.islandBackgroundColor,
        "--glass-intensity": glassStrength,
        "--glass-mask-opacity": glassMaskOpacity,
        "--glass-soft-alpha": 0.045 + glassStrength * 0.045,
        "--glass-shadow-alpha": 0.14 + glassStrength * 0.1,
        "--glass-inset-alpha": 0.2 + glassStrength * 0.2,
        "--glass-cyan-alpha": glassStrength * 0.16,
        "--glass-magenta-alpha": glassStrength * 0.1,
        "--glass-glow-alpha": 0.16 + glassStrength * 0.14,
        "--glass-accent-alpha": glassStrength * 0.055,
        "--glass-refraction-opacity": 0.45 + glassStrength * 0.38,
        "--glass-border-alpha": 0.1 + glassStrength * 0.18,
        "--glass-inner-accent-alpha": glassStrength * 0.08,
        "--glass-highlight-opacity": 0.34 + glassStrength * 0.38,
        "--glass-panel-accent-alpha": glassStrength * 0.085,
        "--glass-panel-blur": `${10 + glassStrength * 9}px`,
        "--glass-tint-color": hexToRgba(
          settings.islandBackgroundColor,
          glassMaskOpacity,
        ),
        "--motion-intensity": motionIntensity,
        "--island-transition-duration": `${Math.round(transitionDuration)}ms`,
        "--edge-glow": edgeGlow,
        "--shadow-depth": shadowDepth,
        "--expanded-island-radius": `${settings.islandCornerRadius}px`,
        "--todo-background-color": settings.todoBackgroundColor,
      }) as CSSProperties;
    },
    [
      expandedIslandHeight,
      collapsedIslandWidth,
      settings.glassIntensity,
      settings.islandBackgroundColor,
      settings.opacity,
      settings.pulseBrightness,
      settings.pulseColor,
      settings.sizeScale,
      settings.taskTextColor,
      settings.todoBackgroundColor,
    ],
  );

  const syncNativeLayout = useCallback(async (nextSettings: IslandSettings) => {
    try {
      await invoke("set_island_layout", {
        layout: {
          sizeScale: nextSettings.sizeScale,
          marginY: nextSettings.marginY,
        },
      });
    } catch (error) {
      console.error("Failed to sync island layout", error);
    }
  }, []);

  const flushNativeLayout = useCallback(() => {
    const syncState = layoutSync.current;

    if (syncState.inFlight) {
      return;
    }

    const nextSettings = syncState.pending;
    syncState.active = nextSettings;
    syncState.inFlight = true;

    void syncNativeLayout(nextSettings).finally(() => {
      const latestState = layoutSync.current;
      latestState.inFlight = false;

      if (latestState.pending !== latestState.active) {
        latestState.frame = window.requestAnimationFrame(() => {
          latestState.frame = null;
          flushNativeLayout();
        });
      }
    });
  }, [syncNativeLayout]);

  const scheduleNativeLayout = useCallback(
    (nextSettings: IslandSettings) => {
      const syncState = layoutSync.current;
      syncState.pending = nextSettings;

      if (syncState.frame !== null || syncState.inFlight) {
        return;
      }

      syncState.frame = window.requestAnimationFrame(() => {
        syncState.frame = null;
        flushNativeLayout();
      });
    },
    [flushNativeLayout],
  );

  const syncNativeInteraction = useCallback(
    async (
      nextMode: IslandMode,
      nextSettings: IslandSettings,
      nextExpandedHeight: number,
      nextCollapsedWidth: number,
      nextIsTucked: boolean,
    ) => {
      try {
        const glassState = await invoke<NativeGlassState>(
          "set_island_interaction",
          {
          mode: nextMode,
          sizeScale: nextSettings.sizeScale,
          marginY: nextSettings.marginY,
          expandedHeight: nextExpandedHeight,
          collapsedWidth: nextCollapsedWidth,
          customPosition: islandPositionRef.current,
          isTucked: nextIsTucked,
            glassEnabled: nextSettings.appearanceMode === "liquidGlass",
            glassIntensity: nextSettings.glassIntensity,
            glassTint: nextSettings.islandBackgroundColor,
          },
        );
        setNativeGlassState(glassState);
      } catch (error) {
        console.error("Failed to sync island interaction", error);
        setNativeGlassState(
          nextSettings.appearanceMode === "liquidGlass"
            ? "css-fallback"
            : "disabled",
        );
      }
    },
    [],
  );

  const showReadyIsland = useCallback(async () => {
    if (didShowInitialWindow.current) {
      return;
    }

    didShowInitialWindow.current = true;

    try {
      await invoke("show_ready_island");
    } catch (error) {
      console.error("Failed to show island", error);
    }
  }, []);

  const refreshClipboardHistory = useCallback(async () => {
    try {
      const snapshot = await invoke<ClipboardHistorySnapshot>(
        "get_clipboard_history",
      );
      setClipboardHistory(snapshot);
    } catch (error) {
      console.error("Failed to read clipboard history", error);
    }
  }, []);

  const refreshAgentStatus = useCallback(async () => {
    if (isRefreshingAgentStatus.current) {
      return;
    }

    isRefreshingAgentStatus.current = true;
    try {
      const snapshot = await invoke<AgentStatusSnapshot>("get_agent_status");
      setAgentStatus(snapshot);
    } catch (error) {
      console.error("Failed to read agent status", error);
      setAgentStatus(DEFAULT_AGENT_STATUS);
    } finally {
      isRefreshingAgentStatus.current = false;
    }
  }, []);

  const clearAgentStatus = useCallback(async (provider: AgentProvider) => {
    setClearingAgentProvider(provider);
    try {
      const snapshot = await invoke<AgentStatusSnapshot>("clear_agent_status", {
        provider,
      });
      setAgentStatus(snapshot);
    } catch (error) {
      console.error("Failed to clear agent status", error);
    } finally {
      setClearingAgentProvider(null);
    }
  }, []);

  const updateClipboardSettings = useCallback(
    async (nextSettings: ClipboardHistorySettings) => {
      const normalizedSettings = normalizeClipboardSettings(nextSettings);

      setClipboardHistory((currentHistory) => ({
        ...currentHistory,
        settings: normalizedSettings,
      }));

      try {
        const snapshot = await invoke<ClipboardHistorySnapshot>(
          "set_clipboard_history_settings",
          { settings: normalizedSettings },
        );
        setClipboardHistory(snapshot);
      } catch (error) {
        console.error("Failed to update clipboard history settings", error);
        void refreshClipboardHistory();
      }
    },
    [refreshClipboardHistory],
  );

  const copyClipboardHistoryItem = useCallback(async (id: string) => {
    try {
      const snapshot = await invoke<ClipboardHistorySnapshot>(
        clipboardHistory.settings.autoPaste
          ? "copy_clipboard_history_item_and_paste_back"
          : "copy_clipboard_history_item",
        { id },
      );
      setClipboardHistory(snapshot);
      if (clipboardHistory.settings.autoPaste) {
        setMode("collapsed");
        setIsTucked(false);
      }
      return true;
    } catch (error) {
      console.error("Failed to copy clipboard history item", error);
      return false;
    }
  }, [clipboardHistory.settings.autoPaste]);

  const toggleClipboardHistoryFavorite = useCallback(async (id: string) => {
    try {
      const snapshot = await invoke<ClipboardHistorySnapshot>(
        "toggle_clipboard_history_favorite",
        { id },
      );
      setClipboardHistory(snapshot);
    } catch (error) {
      console.error("Failed to toggle clipboard history favorite", error);
    }
  }, []);

  const updateClipboardHistoryItemNote = useCallback(
    async (id: string, note: string) => {
      try {
        const snapshot = await invoke<ClipboardHistorySnapshot>(
          "set_clipboard_history_item_note",
          { id, note },
        );
        setClipboardHistory(snapshot);
        return true;
      } catch (error) {
        console.error("Failed to update clipboard history item note", error);
        return false;
      }
    },
    [],
  );

  const deleteClipboardHistoryItem = useCallback(async (id: string) => {
    try {
      const snapshot = await invoke<ClipboardHistorySnapshot>(
        "delete_clipboard_history_item",
        { id },
      );
      setClipboardHistory(snapshot);
    } catch (error) {
      console.error("Failed to delete clipboard history item", error);
    }
  }, []);

  const clearClipboardHistoryItems = useCallback(async () => {
    try {
      const snapshot = await invoke<ClipboardHistorySnapshot>(
        "clear_clipboard_history",
      );
      setClipboardHistory(snapshot);
    } catch (error) {
      console.error("Failed to clear clipboard history", error);
    }
  }, []);

  const minimizeIsland = useCallback(async () => {
    try {
      await invoke("minimize_island");
    } catch (error) {
      console.error("Failed to minimize island", error);
    }
  }, []);

  const startIslandDrag = useCallback(() => {
    void invoke("start_island_drag").catch((error) => {
      console.error("Failed to start island drag", error);
    });
  }, []);

  const resetIslandPosition = useCallback(async () => {
    try {
      await invoke("reset_island_position");
      islandPositionRef.current = null;
      window.localStorage.removeItem(ISLAND_POSITION_STORAGE_KEY);
    } catch (error) {
      console.error("Failed to reset island position", error);
    }
  }, []);

  const setIslandMode = useCallback((nextMode: IslandMode) => {
    setMode(nextMode);
    setIsTucked(false);
  }, []);

  const tuckIsland = useCallback(() => {
    setIslandMode("collapsed");
    setIsTucked(true);
  }, [setIslandMode]);

  const revealIsland = useCallback(() => {
    setIsTucked(false);
  }, []);

  const openIslandPage = useCallback((nextPage: IslandPage) => {
    setPage(nextPage);
    setMode("expanded");
    setIsTucked(false);
  }, []);

  const openClipboardHistory = useCallback(() => {
    openIslandPage("clipboard");
  }, [openIslandPage]);

  const toggleClipboardHistory = useCallback(() => {
    const now = Date.now();

    if (now - clipboardShortcutToggleAt.current < 250) {
      return;
    }

    clipboardShortcutToggleAt.current = now;

    if (mode === "expanded" && page === "clipboard") {
      setIslandMode("collapsed");
      return;
    }

    openClipboardHistory();
  }, [mode, openClipboardHistory, page, setIslandMode]);

  const clearClipboardShortcutFocus = useCallback(() => {
    setFocusClipboardShortcutToken(0);
  }, []);

  const collapseIsland = useCallback(() => {
    setIslandMode("collapsed");
  }, [setIslandMode]);

  const refreshMediaState = useCallback(async () => {
    if (isRefreshingMediaState.current) {
      return;
    }

    isRefreshingMediaState.current = true;

    try {
      const nextMediaState = await invoke<MediaState>("get_media_state");

      setMediaState((currentState) => {
        const intent = mediaPlaybackIntent.current;
        const playbackStatus =
          intent && Date.now() < intent.expiresAt
            ? intent.status
            : nextMediaState.playbackStatus;

        if (intent && Date.now() >= intent.expiresAt) {
          mediaPlaybackIntent.current = null;
        }

        if (playbackStatus === "paused") {
          return {
            ...nextMediaState,
            audioActive: false,
            audioPeak: 0,
            playbackStatus,
          };
        }

        const nextPeak = Math.max(
          currentState.audioPeak * 0.82,
          nextMediaState.audioPeak,
        );
        const audioActive =
          nextMediaState.audioActive || nextPeak > AUDIO_ACTIVE_THRESHOLD;

        return {
          ...nextMediaState,
          audioActive,
          audioPeak: audioActive ? nextPeak : 0,
          playbackStatus,
        };
      });
    } catch (error) {
      console.error("Failed to read media state", error);
      setMediaState(DEFAULT_MEDIA_STATE);
    } finally {
      isRefreshingMediaState.current = false;
    }
  }, []);

  const runMediaCommand = useCallback(
    async (command: "media_play_pause" | "media_next" | "media_previous") => {
      if (isRunningMediaCommand.current) {
        return;
      }

      const isPlayPause = command === "media_play_pause";
      const isCurrentlyPlaying = mediaState.playbackStatus === "playing";
      const intendedStatus: MediaPlaybackStatus = isPlayPause
        ? isCurrentlyPlaying
          ? "paused"
          : "playing"
        : mediaState.playbackStatus;

      mediaPlaybackIntent.current = {
        status: intendedStatus,
        expiresAt: Date.now() + (isPlayPause ? 1200 : 1800),
      };

      if (isPlayPause) {
        setMediaState((currentState) => ({
          ...currentState,
          available: intendedStatus === "playing" || currentState.available,
          audioActive:
            intendedStatus === "playing" && currentState.audioActive,
          audioPeak: intendedStatus === "paused" ? 0 : currentState.audioPeak,
          playbackStatus: intendedStatus,
          updatedAt: Date.now(),
        }));
      }

      isRunningMediaCommand.current = true;
      setIsMediaTrackChanging(!isPlayPause);
      setMediaCommandError(null);
      try {
        const nextMediaState = await invoke<MediaState>(command);
        setMediaState((currentState) => {
          if (intendedStatus === "paused") {
            return {
              ...nextMediaState,
              audioActive: false,
              audioPeak: 0,
              playbackStatus: intendedStatus,
            };
          }

          return {
            ...nextMediaState,
            audioActive:
              nextMediaState.audioActive || currentState.audioActive,
            audioPeak: Math.max(
              nextMediaState.audioPeak,
              currentState.audioPeak * 0.82,
            ),
            playbackStatus: intendedStatus,
          };
        });
      } catch (error) {
        console.error(`Failed to run media command: ${command}`, error);
        setMediaCommandError(String(error));
        mediaPlaybackIntent.current = null;
        await refreshMediaState();
      } finally {
        isRunningMediaCommand.current = false;
        setIsMediaTrackChanging(false);
      }
    },
    [mediaState.audioActive, mediaState.playbackStatus, refreshMediaState],
  );

  useEffect(() => {
    const updateVisibility = () => setIsDocumentVisible(!document.hidden);

    document.addEventListener("visibilitychange", updateVisibility);
    return () => document.removeEventListener("visibilitychange", updateVisibility);
  }, []);

  const openNotification = useCallback(() => {
    if (!latestWindowsNotification?.isExternal) {
      return;
    }

    setNotificationDetail(latestWindowsNotification);
    openIslandPage("notification");
  }, [latestWindowsNotification, openIslandPage]);

  const openNotificationAction = useCallback((url: string) => {
    if (!/^https?:\/\//i.test(url)) {
      return;
    }

    void openUrl(url).catch((error) => {
      console.error("Failed to open external notification link", error);
    });
  }, []);

  const resetFocusTimer = useCallback(() => {
    setFocusTimer((current) => ({
      remainingSeconds: settings.focusDurationMinutes * 60,
      isRunning: false,
      endsAt: null,
      completedSessions: current.completedSessions,
    }));
  }, [settings.focusDurationMinutes]);

  const toggleFocusTimer = useCallback(() => {
    if (!activeTaskTitle) {
      return;
    }

    setFocusTimer((current) => {
      if (current.isRunning) {
        const remainingSeconds = current.endsAt
          ? Math.max(0, Math.ceil((current.endsAt - Date.now()) / 1000))
          : current.remainingSeconds;
        return { ...current, remainingSeconds, isRunning: false, endsAt: null };
      }

      const remainingSeconds = current.remainingSeconds > 0
        ? current.remainingSeconds
        : settings.focusDurationMinutes * 60;
      return {
        ...current,
        remainingSeconds,
        isRunning: true,
        endsAt: Date.now() + remainingSeconds * 1000,
      };
    });
  }, [activeTaskTitle, settings.focusDurationMinutes]);

  useEffect(() => {
    let didCancel = false;

    const refreshAudioLevel = async () => {
      if (didCancel || isRefreshingAudioLevel.current) {
        return;
      }

      isRefreshingAudioLevel.current = true;

      try {
        const audioLevel = await invoke<AudioLevel>("get_audio_level");

        if (didCancel) {
          return;
        }

        setMediaState((currentState) => {
          const intent = mediaPlaybackIntent.current;
          const isPauseIntent =
            intent &&
            Date.now() < intent.expiresAt &&
            intent.status === "paused";

          if (currentState.playbackStatus === "paused" || isPauseIntent) {
            return {
              ...currentState,
              audioActive: false,
              audioPeak: 0,
              playbackStatus: "paused",
            };
          }

          const decayedPeak = currentState.audioPeak * 0.82;
          const nextPeak = audioLevel.active
            ? Math.max(decayedPeak, audioLevel.peak)
            : decayedPeak;
          const audioActive =
            (audioLevel.active || nextPeak > AUDIO_ACTIVE_THRESHOLD * 1.5);

          return {
            ...currentState,
            audioActive,
            audioPeak: audioActive ? nextPeak : 0,
          };
        });
      } catch (error) {
        console.error("Failed to read audio level", error);
      } finally {
        isRefreshingAudioLevel.current = false;
      }
    };

    if (!shouldMonitorAudio) {
      return () => {
        didCancel = true;
      };
    }

    void refreshAudioLevel();

    const interval = window.setInterval(() => {
      void refreshAudioLevel();
    }, page === "music" ? 500 : 2_000);

    return () => {
      didCancel = true;
      window.clearInterval(interval);
    };
  }, [page, shouldMonitorAudio]);

  const addTodo = useCallback(() => {
    const title = draftTodo.trim();

    if (!title) {
      return;
    }

    setTodos((currentTodos) => [
      {
        id: createTodoId(),
        title,
        completed: false,
        createdAt: Date.now(),
      },
      ...currentTodos,
    ]);
    setDraftTodo("");
  }, [draftTodo]);

  const toggleTodo = useCallback((id: string) => {
    setTodos((currentTodos) =>
      currentTodos.map((todo) =>
        todo.id === id ? { ...todo, completed: !todo.completed } : todo,
      ),
    );
    setActiveTodoId((currentId) => (currentId === id ? null : currentId));
  }, []);

  const updateTodoTitle = useCallback((id: string, title: string) => {
    const nextTitle = title.trim();

    if (!nextTitle) {
      return;
    }

    setTodos((currentTodos) =>
      currentTodos.map((todo) =>
        todo.id === id ? { ...todo, title: nextTitle } : todo,
      ),
    );
  }, []);

  const startTodo = useCallback(
    (id: string) => {
      const todo = todos.find((item) => item.id === id);

      if (!todo || todo.completed) {
        return;
      }

      if (activeTodoId === id) {
        setActiveTodoId(null);
        return;
      }

      setActiveTodoId(id);
      setIslandMode("collapsed");
    },
    [activeTodoId, setIslandMode, todos],
  );

  const deleteTodo = useCallback((id: string) => {
    setTodos((currentTodos) => currentTodos.filter((todo) => todo.id !== id));
    setActiveTodoId((currentId) => (currentId === id ? null : currentId));
  }, []);

  const reorderTodo = useCallback((sourceId: string, targetId: string) => {
    if (sourceId === targetId) {
      return;
    }

    setTodos((currentTodos) => {
      const sourceIndex = currentTodos.findIndex((todo) => todo.id === sourceId);
      const targetIndex = currentTodos.findIndex((todo) => todo.id === targetId);

      if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
        return currentTodos;
      }

      const nextTodos = [...currentTodos];
      const [movedTodo] = nextTodos.splice(sourceIndex, 1);
      const insertIndex = targetIndex;
      nextTodos.splice(insertIndex, 0, movedTodo);

      return nextTodos;
    });
  }, []);

  const upsertArchive = useCallback(
    (
      date: string,
      todoList: TodoItem[],
      nextDailyNote: string,
      savedToDisk: boolean,
      filePath?: string,
    ) => {
      const archive: TodoArchive = {
        date,
        todos: todoList,
        dailyNote: nextDailyNote,
        savedAt: Date.now(),
        savedToDisk,
        filePath,
      };

      setArchives((currentArchives) =>
        [archive, ...currentArchives.filter((item) => item.date !== date)].sort(
          (a, b) => b.date.localeCompare(a.date),
        ),
      );
    },
    [],
  );

  const saveTodosToDisk = useCallback(
    async (date: string, todoList: TodoItem[], nextDailyNote: string) => {
      const directory = saveDirectory.trim();

      if (!directory) {
        throw new Error("Missing todo save path.");
      }

      const result = await invoke<SaveTodoResult>("save_todo_markdown", {
        directory,
        date,
        content: formatTodoDocumentAsMarkdown(todoList, nextDailyNote),
      });

      upsertArchive(date, todoList, nextDailyNote, true, result.filePath);
      window.localStorage.setItem(
        TODO_LAST_SAVED_SIGNATURE_STORAGE_KEY,
        getTodoSignature(date, todoList, nextDailyNote),
      );

      return result;
    },
    [saveDirectory, upsertArchive],
  );

  const showTodoSavedState = useCallback(() => {
    if (saveStateResetTimer.current !== null) {
      window.clearTimeout(saveStateResetTimer.current);
    }

    setSaveState("saved");
    saveStateResetTimer.current = window.setTimeout(() => {
      setSaveState("idle");
      saveStateResetTimer.current = null;
    }, 1200);
  }, []);

  const saveTodayTodos = useCallback(async () => {
    if (!saveDirectory.trim()) {
      setSaveState("needs-path");
      setPage("layout");
      setMode("expanded");
      setIsTucked(false);
      return;
    }

    setSaveState("saving");

    try {
      await saveTodosToDisk(currentTodoDate, todos, dailyNote);
      showTodoSavedState();
    } catch (error) {
      console.error("Failed to save todo markdown", error);
      setSaveState("error");
    }
  }, [
    currentTodoDate,
    dailyNote,
    saveDirectory,
    saveTodosToDisk,
    showTodoSavedState,
    todos,
  ]);

  const saveDirectoryFromEditor = useCallback(() => {
    const nextDirectory = saveDirectoryDraft.trim();

    setSaveDirectory(nextDirectory);
    setSaveDirectoryDraft(nextDirectory);
    setSaveState("idle");
    setSavePathState("saved");
    window.setTimeout(() => setSavePathState("idle"), 1200);
  }, [saveDirectoryDraft]);

  const showArchive = useCallback(() => {
    setTodoPageMode("archive");
    setSelectedArchiveDate(null);
    setDraftTodo("");
  }, []);

  const showToday = useCallback(() => {
    setTodoPageMode("today");
    setSelectedArchiveDate(null);
    setDraftTodo("");
  }, []);

  const showDaily = useCallback(() => {
    setTodoPageMode("daily");
    setSelectedArchiveDate(null);
    setDraftTodo("");
  }, []);

  const selectArchive = useCallback(
    (date: string) => {
      if (date === currentTodoDate) {
        showToday();
        return;
      }

      setSelectedArchiveDate(date);
      setTodoPageMode("review");
      setDraftTodo("");
    },
    [currentTodoDate, showToday],
  );

  const rolloverToToday = useCallback(
    async (nextDate: string) => {
      const signature = getTodoSignature(currentTodoDate, todos, dailyNote);
      const lastSavedSignature = window.localStorage.getItem(
        TODO_LAST_SAVED_SIGNATURE_STORAGE_KEY,
      );
      const carryOverCreatedAt = Date.now();
      const carriedTodos = settings.carryOverIncompleteTodos
        ? todos
            .filter((todo) => !todo.completed)
            .map((todo, index) => ({
              ...todo,
              id: createTodoId(),
              completed: false,
              createdAt: carryOverCreatedAt + index,
            }))
        : [];

      if (
        (todos.length > 0 || dailyNote.trim()) &&
        signature !== lastSavedSignature
      ) {
        if (saveDirectory.trim()) {
          try {
            await saveTodosToDisk(currentTodoDate, todos, dailyNote);
          } catch (error) {
            console.error("Failed to auto-save todo markdown", error);
            upsertArchive(currentTodoDate, todos, dailyNote, false);
          }
        } else {
          upsertArchive(currentTodoDate, todos, dailyNote, false);
        }
      }

      setTodos(carriedTodos);
      setDailyNote("");
      setActiveTodoId(null);
      setFocusTimer({
        remainingSeconds: settings.focusDurationMinutes * 60,
        isRunning: false,
        endsAt: null,
        completedSessions: 0,
      });
      setCurrentTodoDate(nextDate);
      setTodoPageMode("today");
      setSelectedArchiveDate(null);

      if (carriedTodos.length > 0) {
        window.localStorage.removeItem(TODO_LAST_SAVED_SIGNATURE_STORAGE_KEY);
      } else {
        window.localStorage.setItem(
          TODO_LAST_SAVED_SIGNATURE_STORAGE_KEY,
          getTodoSignature(nextDate, [], ""),
        );
      }
    },
    [
      currentTodoDate,
      dailyNote,
      saveDirectory,
      saveTodosToDisk,
      settings.carryOverIncompleteTodos,
      settings.focusDurationMinutes,
      todos,
      upsertArchive,
    ],
  );

  const resetSettings = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
    scheduleNativeLayout(DEFAULT_SETTINGS);
  }, [scheduleNativeLayout]);

  const saveSettingsPreset = useCallback(() => {
    setSettingPresets((currentPresets) => {
      const customPresetCount = currentPresets.filter(
        (preset) => !preset.isDefault && !isDefaultSettingPreset(preset.id),
      ).length;
      const preset: IslandPreset = {
        id: createTodoId(),
        name: `样式预设 ${customPresetCount + 1}`,
        settings,
        createdAt: Date.now(),
        isDefault: false,
      };

      return mergeWithDefaultSettingPresets([preset, ...currentPresets]);
    });
  }, [settings]);

  const applySettingsPreset = useCallback(
    (presetId: string) => {
      const preset = settingPresets.find((item) => item.id === presetId);

      if (!preset) {
        return;
      }

      const nextSettings = normalizeSettings(preset.settings);
      setSettings(nextSettings);
      scheduleNativeLayout(nextSettings);
    },
    [scheduleNativeLayout, settingPresets],
  );

  const renameSettingsPreset = useCallback((presetId: string, name: string) => {
    const nextName = name.trim();

    if (
      !nextName ||
      isDefaultSettingPreset(presetId) ||
      LEGACY_DEFAULT_PRESET_NAMES.has(nextName)
    ) {
      return;
    }

    setSettingPresets((currentPresets) =>
      currentPresets.map((preset) =>
        preset.id === presetId ? { ...preset, name: nextName } : preset,
      ),
    );
  }, []);

  const deleteSettingsPreset = useCallback((presetId: string) => {
    if (isDefaultSettingPreset(presetId)) {
      return;
    }

    setSettingPresets((currentPresets) =>
      currentPresets.filter((preset) => preset.id !== presetId),
    );
  }, []);

  const updateLaunchAtStartup = useCallback(async (enabled: boolean) => {
    setLaunchAtStartup(enabled);

    try {
      await invoke("set_launch_at_startup", { enabled });
    } catch (error) {
      console.error("Failed to update launch at startup", error);
      setLaunchAtStartup(!enabled);
    }
  }, []);

  const installAgentHooks = useCallback(async () => {
    setAgentHooksInstallState("installing");
    setAgentHooksInstallError("");

    try {
      const result = await invoke<AgentHooksInstallResult>(
        "install_agent_status_hooks",
      );
      setAgentHooksInstallResult(result);
      setAgentHooksInstallState("installed");
      void refreshAgentStatus();
    } catch (error) {
      console.error("Failed to install agent status hooks", error);
      setAgentHooksInstallError(getErrorMessage(error));
      setAgentHooksInstallState("error");
    }
  }, [refreshAgentStatus]);

  useEffect(() => {
    void invoke<boolean>("get_launch_at_startup")
      .then(setLaunchAtStartup)
      .catch((error) => {
        console.error("Failed to read launch at startup", error);
      });
  }, []);

  useEffect(() => {
    void refreshClipboardHistory();

    let didCancel = false;
    let unlistenChanges: (() => void) | null = null;
    let unlistenShortcut: (() => void) | null = null;

    void listen("clipboard-history-changed", () => {
      void refreshClipboardHistory();
    })
      .then((nextUnlisten) => {
        if (didCancel) {
          nextUnlisten();
        } else {
          unlistenChanges = nextUnlisten;
        }
      })
      .catch((error) => {
        console.error("Failed to listen for clipboard history changes", error);
      });

    void listen("clipboard-history-shortcut", () => {
      toggleClipboardHistory();
    })
      .then((nextUnlisten) => {
        if (didCancel) {
          nextUnlisten();
        } else {
          unlistenShortcut = nextUnlisten;
        }
      })
      .catch((error) => {
        console.error("Failed to listen for clipboard history shortcut", error);
      });

    return () => {
      didCancel = true;
      unlistenChanges?.();
      unlistenShortcut?.();
    };
  }, [refreshClipboardHistory, toggleClipboardHistory]);

  useEffect(() => {
    let didCancel = false;
    let unlisten: (() => void) | null = null;

    void listen<WindowsNotificationEvent>("windows-notification-debug", ({ payload }) => {
      if (!didCancel) {
        if (payload.notificationId > 0 && !payload.source.startsWith("notification listener online")) {
          if (payload.isExternal) {
            const kind = payload.kind === "voice" || payload.kind === "image" || payload.kind === "video" ? payload.kind : "text";
            if (!settings.notificationRules.enabledKinds.includes(kind)) {
              return;
            }
            setLatestWindowsNotification(payload);
            setExternalNotificationHistory((current) => [payload, ...current]
              .filter((item, index, items) => items.findIndex((candidate) => candidate.notificationId === item.notificationId && candidate.receivedAt === item.receivedAt) === index)
              .slice(0, 20));
            if (payload.priority === "high" && settings.notificationRules.allowHighPriorityAutoOpen) {
              setNotificationDetail(payload);
              openIslandPage("notification");
            }
          } else {
            setLatestWindowsNotification(payload);
          }
        }
      }
    })
      .then((nextUnlisten) => {
        if (didCancel) nextUnlisten();
        else unlisten = nextUnlisten;
      })
      .catch((error) => console.error("Failed to listen for Windows notifications", error));

    return () => {
      didCancel = true;
      unlisten?.();
    };
  }, [openIslandPage, settings.notificationRules]);

  useEffect(() => {
    if (!latestWindowsNotification) return;
    const duration = latestWindowsNotification.isExternal
      ? settings.notificationRules.displayDurationSeconds * 1_000
      : clamp(latestWindowsNotification.durationMs ?? 12_000, 3_000, 60_000);
    const timer = window.setTimeout(() => setLatestWindowsNotification(null), duration);
    return () => window.clearTimeout(timer);
  }, [latestWindowsNotification, settings.notificationRules.displayDurationSeconds]);

  useEffect(() => {
    window.localStorage.setItem(
      EXTERNAL_NOTIFICATION_HISTORY_STORAGE_KEY,
      JSON.stringify(externalNotificationHistory),
    );
  }, [externalNotificationHistory]);

  useEffect(() => {
    if (page !== "notification" || notificationDetail || !externalNotificationHistory.length) {
      return;
    }

    setNotificationDetail(externalNotificationHistory[0]);
  }, [externalNotificationHistory, notificationDetail, page]);

  useEffect(() => {
    if (!isIslandActive) {
      return;
    }

    void refreshMediaState();

    const interval = window.setInterval(() => {
      void refreshMediaState();
    }, page === "music" ? 1_500 : 8_000);

    return () => window.clearInterval(interval);
  }, [isIslandActive, page, refreshMediaState]);

  useEffect(() => {
    if (mediaState.playbackStatus !== "playing" || !lyricsState.text) {
      return;
    }

    const interval = window.setInterval(() => setPlaybackClock(Date.now()), 250);
    return () => window.clearInterval(interval);
  }, [lyricsState.text, mediaState.playbackStatus]);

  useEffect(() => {
    if (!settings.showLyrics) {
      setLyricsState({ status: "idle", text: "" });
      return;
    }

    if (!mediaState.trackTitle.trim()) {
      setLyricsState({
        status: mediaState.available || mediaState.audioActive
          ? "missing-metadata"
          : "idle",
        text: "",
      });
      return;
    }

    const title = mediaState.trackTitle.trim();
    const artist = mediaState.trackArtist.trim();
    const cacheKey = `${artist.toLowerCase()}\n${title.toLowerCase()}`;
    const cachedLyrics = lyricsCache.current.get(cacheKey);
    if (cachedLyrics !== undefined) {
      setLyricsState({
        status: cachedLyrics ? "ready" : "empty",
        text: cachedLyrics,
      });
      return;
    }

    const controller = new AbortController();
    setLyricsState({ status: "loading", text: "" });

    void fetchTrackLyrics(title, artist, controller.signal)
      .then((lyrics) => {
        if (controller.signal.aborted) {
          return;
        }
        lyricsCache.current.set(cacheKey, lyrics);
        setLyricsState({ status: lyrics ? "ready" : "empty", text: lyrics });
      })
      .catch((error) => {
        if (controller.signal.aborted) {
          return;
        }
        console.error("Failed to load lyrics", error);
        setLyricsState({ status: "error", text: "" });
      });

    return () => controller.abort();
  }, [
    mediaState.audioActive,
    mediaState.available,
    mediaState.trackArtist,
    mediaState.trackTitle,
    settings.showLyrics,
  ]);

  useEffect(() => {
    if (!isIslandActive) {
      return;
    }

    void refreshAgentStatus();

    const interval = window.setInterval(() => {
      void refreshAgentStatus();
    }, mode === "expanded" && page === "layout" ? 400 : 1_200);

    return () => window.clearInterval(interval);
  }, [isIslandActive, mode, page, refreshAgentStatus]);

  useEffect(() => {
    if (
      !shouldInitializeDefaultSaveDirectory.current ||
      saveDirectory.trim() ||
      defaultSaveDirectoryRequestInFlight.current
    ) {
      return;
    }

    let didCancel = false;
    defaultSaveDirectoryRequestInFlight.current = true;

    void invoke<string>("get_default_todo_save_directory")
      .then((defaultDirectory) => {
        if (didCancel) {
          return;
        }

        const nextDirectory = defaultDirectory.trim();

        if (!nextDirectory) {
          return;
        }

        shouldInitializeDefaultSaveDirectory.current = false;
        setSaveDirectory((currentDirectory) =>
          currentDirectory.trim() ? currentDirectory : nextDirectory,
        );
        setSaveDirectoryDraft((currentDirectory) =>
          currentDirectory.trim() ? currentDirectory : nextDirectory,
        );
      })
      .catch((error) => {
        console.error("Failed to resolve default todo save path", error);
      })
      .finally(() => {
        if (!didCancel) {
          defaultSaveDirectoryRequestInFlight.current = false;
        }
      });

    return () => {
      didCancel = true;
      defaultSaveDirectoryRequestInFlight.current = false;
    };
  }, [saveDirectory]);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    window.localStorage.setItem(FOCUS_TIMER_STORAGE_KEY, JSON.stringify(focusTimer));
  }, [focusTimer]);

  useEffect(() => {
    if (!focusTimer.isRunning || !focusTimer.endsAt) {
      return;
    }

    const updateTimer = () => {
      setFocusTimer((current) => {
        if (!current.isRunning || !current.endsAt) {
          return current;
        }

        const remainingSeconds = Math.max(
          0,
          Math.ceil((current.endsAt - Date.now()) / 1000),
        );
        if (remainingSeconds === 0) {
          setFocusCompletionNotice(true);
          window.setTimeout(() => setFocusCompletionNotice(false), 12_000);
          if ("Notification" in window && Notification.permission === "granted") {
            new Notification("专注完成", { body: "这一轮专注已经结束，稍作休息吧。" });
          }
          return {
            remainingSeconds: settings.focusDurationMinutes * 60,
            isRunning: false,
            endsAt: null,
            completedSessions: current.completedSessions + 1,
          };
        }

        return remainingSeconds === current.remainingSeconds
          ? current
          : { ...current, remainingSeconds };
      });
    };

    updateTimer();
    const interval = window.setInterval(updateTimer, 1_000);
    return () => window.clearInterval(interval);
  }, [focusTimer.endsAt, focusTimer.isRunning, settings.focusDurationMinutes]);

  useEffect(() => {
    if (!("Notification" in window) || Notification.permission !== "default") {
      return;
    }

    void Notification.requestPermission();
  }, []);

  const toggleExternalNotificationPinned = useCallback(
    (target: WindowsNotificationEvent) => {
      setExternalNotificationHistory((current) =>
        current.map((item) =>
          item.notificationId === target.notificationId && item.receivedAt === target.receivedAt
            ? { ...item, pinned: !item.pinned }
            : item,
        ),
      );
      setNotificationDetail((current) =>
        current && current.notificationId === target.notificationId && current.receivedAt === target.receivedAt
          ? { ...current, pinned: !current.pinned }
          : current,
      );
    },
    [],
  );

  const deleteExternalNotification = useCallback((target: WindowsNotificationEvent) => {
    setExternalNotificationHistory((current) => {
      const next = current.filter(
        (item) => item.notificationId !== target.notificationId || item.receivedAt !== target.receivedAt,
      );
      setNotificationDetail((currentDetail) => {
        if (!currentDetail || currentDetail.notificationId !== target.notificationId || currentDetail.receivedAt !== target.receivedAt) {
          return currentDetail;
        }
        return next[0] ?? null;
      });
      return next;
    });
  }, []);

  const clearExternalNotifications = useCallback(() => {
    setExternalNotificationHistory([]);
    setNotificationDetail(null);
  }, []);

  const exportBackup = useCallback(() => {
    const data = {
      version: 1,
      exportedAt: new Date().toISOString(),
      settings,
      settingPresets,
      todos,
      dailyNote,
      archives,
      currentTodoDate,
      externalNotificationHistory,
      clipboardSettings: clipboardHistory.settings,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `FocuSD-备份-${getLocalDateString()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }, [archives, clipboardHistory.settings, currentTodoDate, dailyNote, externalNotificationHistory, settingPresets, settings, todos]);

  const importBackup = useCallback((file: File) => {
    void file.text().then((text) => {
      const data = JSON.parse(text) as Record<string, unknown>;
      if (!data || typeof data !== "object") throw new Error("备份文件格式不正确");
      if (data.settings) setSettings(normalizeSettings(data.settings as LegacyIslandSettings));
      if (Array.isArray(data.settingPresets)) setSettingPresets(loadSettingPresetsFromValue(data.settingPresets));
      if (Array.isArray(data.todos)) setTodos(data.todos.map((item) => normalizeTodo(item as Partial<TodoItem>)).filter((item) => item.title));
      if (typeof data.dailyNote === "string") setDailyNote(data.dailyNote);
      if (Array.isArray(data.archives)) setArchives(data.archives as TodoArchive[]);
      if (typeof data.currentTodoDate === "string") setCurrentTodoDate(data.currentTodoDate);
      if (Array.isArray(data.externalNotificationHistory)) setExternalNotificationHistory(data.externalNotificationHistory as WindowsNotificationEvent[]);
      if (data.clipboardSettings && typeof data.clipboardSettings === "object") {
        void updateClipboardSettings({ ...clipboardHistory.settings, ...(data.clipboardSettings as ClipboardHistorySettings) });
      }
    }).catch((error) => window.alert(`导入备份失败：${getErrorMessage(error)}`));
  }, [clipboardHistory.settings, updateClipboardSettings]);

  useEffect(() => {
    window.localStorage.setItem(
      SETTINGS_PRESETS_STORAGE_KEY,
      JSON.stringify(settingPresets),
    );
  }, [settingPresets]);

  useEffect(() => {
    window.localStorage.setItem(TODOS_STORAGE_KEY, JSON.stringify(todos));
  }, [todos]);

  useEffect(() => {
    window.localStorage.setItem(DAILY_NOTE_STORAGE_KEY, dailyNote);
  }, [dailyNote]);

  useEffect(() => {
    window.localStorage.setItem(TODO_DATE_STORAGE_KEY, currentTodoDate);
  }, [currentTodoDate]);

  useEffect(() => {
    window.localStorage.setItem(TODO_ARCHIVE_STORAGE_KEY, JSON.stringify(archives));
  }, [archives]);

  useEffect(() => {
    if (!saveDirectory && shouldInitializeDefaultSaveDirectory.current) {
      return;
    }

    window.localStorage.setItem(TODO_SAVE_DIRECTORY_STORAGE_KEY, saveDirectory);
  }, [saveDirectory]);

  useEffect(() => {
    if (!didHydrateAutoSave.current) {
      didHydrateAutoSave.current = true;
      return;
    }

    if (autoSaveTimer.current !== null) {
      window.clearTimeout(autoSaveTimer.current);
      autoSaveTimer.current = null;
    }

    if (!saveDirectory.trim()) {
      return;
    }

    const signature = getTodoSignature(currentTodoDate, todos, dailyNote);
    const lastSavedSignature = window.localStorage.getItem(
      TODO_LAST_SAVED_SIGNATURE_STORAGE_KEY,
    );

    if (!todos.length && !dailyNote.trim() && !lastSavedSignature) {
      return;
    }

    if (signature === lastSavedSignature) {
      return;
    }

    const timer = window.setTimeout(() => {
      autoSaveTimer.current = null;
      autoSaveRequestId.current += 1;
      const requestId = autoSaveRequestId.current;

      void saveTodosToDisk(currentTodoDate, todos, dailyNote)
        .catch((error) => {
          if (requestId === autoSaveRequestId.current) {
            console.error("Failed to auto-save todo markdown", error);
            setSaveState("error");
          }
        });
    }, 700);

    autoSaveTimer.current = timer;

    return () => {
      if (autoSaveTimer.current === timer) {
        window.clearTimeout(timer);
        autoSaveTimer.current = null;
      }
    };
  }, [
    currentTodoDate,
    dailyNote,
    saveDirectory,
    saveTodosToDisk,
    todos,
  ]);

  useEffect(
    () => () => {
      if (autoSaveTimer.current !== null) {
        window.clearTimeout(autoSaveTimer.current);
      }

      if (saveStateResetTimer.current !== null) {
        window.clearTimeout(saveStateResetTimer.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (activeTodoId) {
      window.localStorage.setItem(ACTIVE_TODO_STORAGE_KEY, activeTodoId);
      return;
    }

    window.localStorage.removeItem(ACTIVE_TODO_STORAGE_KEY);
  }, [activeTodoId]);

  useEffect(() => {
    if (
      activeTodoId &&
      !todos.some((todo) => todo.id === activeTodoId && !todo.completed)
    ) {
      setActiveTodoId(null);
    }
  }, [activeTodoId, todos]);

  useEffect(() => {
    if (activeTaskTitle || !focusTimer.isRunning) {
      return;
    }

    setFocusTimer((current) => ({
      ...current,
      isRunning: false,
      endsAt: null,
    }));
  }, [activeTaskTitle, focusTimer.isRunning]);

  useEffect(() => {
    if (didCheckDate.current) {
      return;
    }

    didCheckDate.current = true;
    const today = getLocalDateString();

    if (currentTodoDate !== today) {
      void rolloverToToday(today);
    }
  }, [currentTodoDate, rolloverToToday]);

  useEffect(() => {
    const checkForNewDay = () => {
      const today = getLocalDateString();

      if (currentTodoDate !== today) {
        void rolloverToToday(today);
      }
    };

    const interval = window.setInterval(checkForNewDay, 30_000);
    return () => window.clearInterval(interval);
  }, [currentTodoDate, rolloverToToday]);

  useEffect(() => {
    scheduleNativeLayout(settings);
  }, [settings.marginY, scheduleNativeLayout]);

  useEffect(() => {
    let didCancel = false;
    let unlisten: (() => void) | null = null;

    void listen<IslandPosition>("island-position-changed", ({ payload }) => {
      islandPositionRef.current = payload;
      window.localStorage.setItem(
        ISLAND_POSITION_STORAGE_KEY,
        JSON.stringify(payload),
      );
    })
      .then((nextUnlisten) => {
        if (didCancel) {
          nextUnlisten();
        } else {
          unlisten = nextUnlisten;
        }
      })
      .catch((error) => {
        console.error("Failed to listen for island position changes", error);
      });

    return () => {
      didCancel = true;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    void syncNativeInteraction(
      mode,
      settings,
      expandedIslandHeight,
      collapsedIslandWidth,
      isTucked,
    ).finally(() => {
      void showReadyIsland();
    });
  }, [
    expandedIslandHeight,
    collapsedIslandWidth,
    isTucked,
    mode,
    settings.marginY,
    settings.appearanceMode,
      settings.glassIntensity,
      settings.motionIntensity,
      settings.transitionSpeed,
      settings.edgeGlow,
      settings.shadowDepth,
      settings.islandCornerRadius,
      settings.motionIntensity,
      settings.transitionSpeed,
      settings.edgeGlow,
      settings.shadowDepth,
      settings.islandCornerRadius,
    settings.islandBackgroundColor,
    settings.sizeScale,
    showReadyIsland,
    syncNativeInteraction,
  ]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.shiftKey && event.key === "Enter") {
        event.preventDefault();
        setPage("todo");
        setTodoPageMode("today");
        setMode("expanded");
        setIsTucked(false);
        setQuickCaptureToken(Date.now());
        return;
      }

      if (matchesClipboardShortcut(event, clipboardHistory.settings.shortcut)) {
        event.preventDefault();
        toggleClipboardHistory();
        return;
      }

      if (event.key === "Escape") {
        collapseIsland();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [clipboardHistory.settings.shortcut, collapseIsland, toggleClipboardHistory]);

  useEffect(() => {
    let didCancel = false;
    let unlisten: (() => void) | null = null;

    void getCurrentWindow()
      .onFocusChanged(({ payload: focused }) => {
        if (!focused && mode === "expanded") {
          collapseIsland();
        }
      })
      .then((nextUnlisten) => {
        if (didCancel) {
          nextUnlisten();
        } else {
          unlisten = nextUnlisten;
        }
      })
      .catch((error) => {
        console.error("Failed to listen for island focus changes", error);
      });

    return () => {
      didCancel = true;
      unlisten?.();
    };
  }, [collapseIsland, mode]);

  const agentVisualState = useMemo(
    () => getAgentVisualState(agentStatus),
    [agentStatus],
  );
  const agentStatusLabel = useMemo(
    () => getAgentStatusLabel(agentStatus),
    [agentStatus],
  );

  return (
    <main className="stage" style={stageStyle}>
      <IslandShell
        mode={mode}
        page={page}
        appearanceMode={settings.appearanceMode}
        nativeGlassState={nativeGlassState}
        isTucked={isTucked}
        showTitle={settings.showTitle}
        islandIdentity={settings.islandIdentity}
        mediaState={mediaState}
        collapsedContent={collapsedContent}
        isShowingMedia={isShowingMedia}
        isShowingNotification={isShowingNotification}
        notification={latestWindowsNotification}
        agentVisualState={agentVisualState}
        agentStatusLabel={agentStatusLabel}
        onOpenPage={openIslandPage}
        onOpenNotification={openNotification}
        onWindowDragStart={startIslandDrag}
        onCollapse={collapseIsland}
        onResetPosition={resetIslandPosition}
        onMinimize={minimizeIsland}
        onTuck={tuckIsland}
        onReveal={revealIsland}
        onPageChange={setPage}
      >
        {page === "layout" && (
          <LayoutEditor
            settings={settings}
            clipboardSettings={clipboardHistory.settings}
            saveDirectoryDraft={saveDirectoryDraft}
            savePathState={savePathState}
            highlightSavePath={saveState === "needs-path"}
            focusClipboardShortcutToken={focusClipboardShortcutToken}
            presets={settingPresets}
            launchAtStartup={launchAtStartup}
            agentStatus={agentStatus}
            clearingAgentProvider={clearingAgentProvider}
            agentHooksInstallState={agentHooksInstallState}
            agentHooksInstallResult={agentHooksInstallResult}
            agentHooksInstallError={agentHooksInstallError}
            onSettingsChange={setSettings}
            onClipboardSettingsChange={updateClipboardSettings}
            onReset={resetSettings}
            onSaveDirectoryDraftChange={setSaveDirectoryDraft}
            onSaveDirectory={saveDirectoryFromEditor}
            onSavePreset={saveSettingsPreset}
            onApplyPreset={applySettingsPreset}
            onRenamePreset={renameSettingsPreset}
            onDeletePreset={deleteSettingsPreset}
            onLaunchAtStartupChange={updateLaunchAtStartup}
            onClearAgentStatus={clearAgentStatus}
            onInstallAgentHooks={installAgentHooks}
            onClipboardShortcutFocusHandled={clearClipboardShortcutFocus}
            onExportBackup={exportBackup}
            onImportBackup={importBackup}
          />
        )}
        {page === "music" && (
          <MusicPlayerPanel
            mediaState={mediaState}
            lyricsState={lyricsState}
            showLyrics={settings.showLyrics}
            playbackPositionSeconds={playbackPositionSeconds}
            isTrackChanging={isMediaTrackChanging}
            commandError={mediaCommandError}
            onPlayPause={() => void runMediaCommand("media_play_pause")}
            onNext={() => void runMediaCommand("media_next")}
            onPrevious={() => void runMediaCommand("media_previous")}
          />
        )}
        {page === "notification" && (
          <ExternalNotificationPanel
            notification={notificationDetail}
            history={externalNotificationHistory}
            onSelect={setNotificationDetail}
            onOpenAction={openNotificationAction}
            onTogglePinned={toggleExternalNotificationPinned}
            onDelete={deleteExternalNotification}
            onClear={clearExternalNotifications}
          />
        )}
        {page === "clipboard" && (
          <ClipboardHistoryPanel
            snapshot={clipboardHistory}
            onCopyItem={copyClipboardHistoryItem}
            onToggleFavorite={(id) => void toggleClipboardHistoryFavorite(id)}
            onUpdateNote={updateClipboardHistoryItemNote}
            onDeleteItem={(id) => void deleteClipboardHistoryItem(id)}
            onClear={() => void clearClipboardHistoryItems()}
          />
        )}
        {page === "todo" && (
          <TodoNotebook
            todos={todos}
            dailyNote={dailyNote}
            draft={draftTodo}
            activeTodoId={activeTodoId}
            pageMode={todoPageMode}
            archives={archives}
            archiveLayout={archiveLayout}
            selectedArchive={selectedArchive}
            saveState={saveState}
            enableTodoReorder={settings.enableTodoReorder}
            onDraftChange={setDraftTodo}
            onAddTodo={addTodo}
            onToggleTodo={toggleTodo}
            onUpdateTodo={updateTodoTitle}
            onStartTodo={startTodo}
            onDeleteTodo={deleteTodo}
            onReorderTodo={reorderTodo}
            onSaveToday={saveTodayTodos}
            onShowArchive={showArchive}
            onShowDaily={showDaily}
            onShowToday={showToday}
            onDailyNoteChange={setDailyNote}
            onArchiveLayoutChange={setArchiveLayout}
            onSelectArchive={selectArchive}
            focusTimer={focusTimer}
            activeTaskTitle={activeTaskTitle}
            onToggleFocusTimer={toggleFocusTimer}
            onResetFocusTimer={resetFocusTimer}
            completedFocusSessions={focusTimer.completedSessions}
            quickCaptureToken={quickCaptureToken}
          />
        )}
      </IslandShell>
    </main>
  );
}

export default App;
