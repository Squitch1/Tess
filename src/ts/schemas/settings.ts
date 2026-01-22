import { UUID } from "crypto";

export type Settings = {
    appTheme: string;
    closeConfirmation: CloseConfirmation;
    desktopIntegration: DesktopIntegration;
    appBehavior: AppBehavior;
    profiles: Profile[];
    macros: Macro[];
    shortcuts: Shortcut[];
    defaultProfile: Profile;
    background:
        | "transparent"
        | "opaque"
        | "blurred"
        | "mica"
        | "acrylic"
        | "vibrancy"
        | { media: BackgroundMedia };
};

export type Shortcut = {
    action: ShortcutAction;
    shortcut: string;
};

export type ShortcutAction =
    | "copy"
    | "paste"
    | "openDefaultProfile"
    | "splitTabAndOpenDefaultProfile"
    | "splitFocusedPaneAndOpenDefaultProfile"
    | "splitSpecificPaneAndOpenDefaultProfile"
    | "closeFocusedTab"
    | "closeWindow"
    | "closeFocusedPane"
    | "closeSpecificPane"
    | "focusNextTab"
    | "focusPrevTab"
    | "focusFirstTab"
    | "focusLastTab"
    | ["focusTab", number]
    | ["executeMacro", UUID]
    | ["openProfile", UUID]
    | ["splitTabAndOpenProfile", UUID]
    | ["splitFocusedPaneAndOpenProfile", UUID]
    | ["splitSpecificPaneAndOpenProfile", UUID];

type Macro = {
    content: string;
    id: UUID;
};

export type TerminalSettings = {
    bell: boolean;
    bufferSize: number;
    cursor: "bar" | "underline" | "block";
    cursorBlink: boolean;
    drawBoldInBright: boolean;
    fontLigature: boolean;
    fontWeight: number;
    fontWeightBold: number;
    fontSize: number;
    letterSpacing: number;
    lineHeight: number;
    showPicture: boolean;
    showUnreadDataMark: boolean;
    minimumContrastRatio: number;
    bracketedPaste: boolean;
    hyperlinkModifier: string;
};

export type Profile = {
    id: UUID;
    name: string;
    command: string;
    terminalSettings: TerminalSettings;
    theme: TerminalTheme;
    backgroundTransparency: number;
    background: BackgroundMedia | null;
};

export type TerminalTheme = {
    foreground: string;
    background: string;
    black: string;
    red: string;
    green: string;
    yellow: string;
    blue: string;
    magenta: string;
    cyan: string;
    white: string;
    brightBlack: string;
    brightRed: string;
    brightGreen: string;
    brightYellow: string;
    brightBlue: string;
    brightMagenta: string;
    brightCyan: string;
    brightWhite: string;
    cursor: string;
    cursorAccent: string;
    highlight: string;
};

export type BackgroundMedia = {
    blur: number;
    location: string;
};

export type CloseConfirmation = {
    group: boolean;
    window: boolean;
    app: boolean;
    excludedProcess: string[];
};

export type DesktopIntegration = {
    dynamicTitle: boolean;
    taskbarProgress: boolean;
};

export type AppBehavior = {
    focusMode: "silent" | "requestAttention" | "focus";
    detailsCardDelay: number;
};
