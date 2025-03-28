import { Profile } from "schemas/settings";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Terminal as Xterm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { CanvasAddon } from "@xterm/addon-canvas";
import Widget from "./base";

export default class Terminal extends Widget {
    xterm: Xterm;

    xtermTarget: HTMLElement;

    xtermFitAddon: FitAddon;

    resizeObserver: ResizeObserver;

    onTerminalResize: (cols: number, rows: number) => void;
    onTerminalNeedClosability: () => Promise<boolean>;
    onTerminalNeedLeaderName: () => Promise<string>;
    onTerminalOutgoingData: (data: string) => void;
    onTerminalKeyPress: (e: KeyboardEvent) => boolean;
    onTerminalExit: () => Promise<void>;

    constructor(profile: Profile) {
        super();

        this.onTerminalResize = () => {};
        this.onTerminalNeedClosability = async () => true;
        this.onTerminalNeedLeaderName = async () => "Untitled";
        this.onTerminalOutgoingData = () => {};
        this.onTerminalKeyPress = () => true;
        this.onTerminalExit = async () => {};

        this.xtermTarget = document.createElement("div");
        this.xtermTarget.classList.add("widget--term");

        if (profile.background) {
            const background = document.createElement("img");
            background.src = convertFileSrc(profile.background.location);
            background.classList.add("background-image");
            this.element.appendChild(background);
            this.xtermTarget.style.setProperty(
                "-webkit-backdrop-filter",
                `blur(${profile.background.blur}px)`
            );
        }

        this.xtermTarget.style.setProperty(
            "--profile-background",
            profile.theme.background
        );
        this.xtermTarget.style.setProperty(
            "--profile-background-transparency",
            `${profile.backgroundTransparency}%`
        );

        this.element.appendChild(this.xtermTarget);

        const theme = structuredClone(profile.theme);
        if (profile.backgroundTransparency < 100) {
            theme.background = "rgba(0,0,0,0)";
        }

        this.xterm = new Xterm({
            allowProposedApi: true,
            fontFamily: "Fira Code, monospace",
            allowTransparency: profile.backgroundTransparency < 100,
            fontSize: profile.terminalSettings.fontSize,
            drawBoldTextInBrightColors:
                profile.terminalSettings.drawBoldInBright,
            cursorBlink: profile.terminalSettings.cursorBlink,
            scrollback: profile.terminalSettings.bufferSize,
            lineHeight: profile.terminalSettings.lineHeight / 100,
            cursorStyle: profile.terminalSettings.cursor,
            letterSpacing: profile.terminalSettings.letterSpacing,
            fontWeight: profile.terminalSettings.fontWeight * 100,
            fontWeightBold: profile.terminalSettings.fontWeightBold * 100,
            ignoreBracketedPasteMode: !profile.terminalSettings.bracketedPaste,
            theme,
        });

        this.xtermFitAddon = new FitAddon();

        this.xterm.loadAddon(this.xtermFitAddon);
        this.xterm.loadAddon(new CanvasAddon());

        this.xterm.onData((data) => this.onTerminalOutgoingData(data));

        this.xterm.attachCustomKeyEventHandler((e) =>
            this.onTerminalKeyPress(e)
        );

        const onRender = this.xterm.onRender(() => {
            setTimeout(() => {
                this.resizeXterm();
            }, 0);
        });
        const onResize = this.xterm.onResize(() => {
            onRender.dispose();
            onResize.dispose();
        });

        this.resizeObserver = new ResizeObserver(() => this.resizeXterm());
    }

    run(): void {
        this.xterm.open(this.xtermTarget);
        this.resizeObserver.observe(this.element);
    }

    getShortTitle(): Promise<string> {
        return this.onTerminalNeedLeaderName();
    }

    getClosability(): Promise<boolean> {
        return this.onTerminalNeedClosability();
    }

    async close(): Promise<void> {
        try {
            this.resizeObserver.disconnect();
            return this.onTerminalExit();
        } catch (e) {
            this.resizeObserver.observe(this.element);
            throw e;
        }
    }

    focus(): void {
        this.xterm.focus();
    }

    blur(): void {
        this.xterm.blur();
    }

    dispose(): void {
        this.xterm.dispose();
        this.resizeObserver.disconnect();
    }

    private resizeXterm() {
        const proposedDimensions = this.xtermFitAddon.proposeDimensions();
        if (proposedDimensions?.cols && proposedDimensions?.rows) {
            this.xterm.resize(proposedDimensions.cols, proposedDimensions.rows);
            this.onTerminalResize(
                proposedDimensions.cols,
                proposedDimensions.rows
            );
        }
    }
}
