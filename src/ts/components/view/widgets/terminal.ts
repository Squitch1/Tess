import { Profile } from "schemas/settings";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import {
    IBufferRange,
    IDecoration,
    IViewportRange,
    Terminal as Xterm,
} from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { CanvasAddon } from "@xterm/addon-canvas";
import { WebLinksAddon } from "@xterm/addon-web-links";
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

    private tooltip?: IDecoration;
    private tooltipPopTimeout?: ReturnType<typeof setTimeout>;
    private hyperlinkModifiers: string[];

    constructor(profile: Profile) {
        super();

        this.hyperlinkModifiers = profile.terminalSettings.hyperlinkModifier
            .toLowerCase()
            .replaceAll(" ", "")
            .split("+")
            .filter((m) => m !== "");

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
        this.xtermTarget.style.setProperty(
            "--terminal-highlight-color",
            profile.theme.highlight
        );

        this.element.appendChild(this.xtermTarget);

        const theme = structuredClone(profile.theme);
        if (profile.backgroundTransparency < 100) {
            theme.background = "rgba(0,0,0,0)";
        }

        this.xterm = new Xterm({
            linkHandler: {
                activate: (e, uri) => this.onLinkClicked(e, uri),
                hover: (_, uri, range) => this.onLinkHovered(uri, range),
                leave: () => this.onLinkLeaved(),
            },
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
        this.xterm.loadAddon(
            new WebLinksAddon((e, uri) => this.onLinkClicked(e, uri), {
                hover: (_, uri, range) => this.onLinkHovered(uri, range),
                leave: () => this.onLinkLeaved(),
            })
        );

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

    private onLinkHovered(uri: string, range: IBufferRange | IViewportRange) {
        if (this.tooltip) {
            return;
        }

        this.tooltipPopTimeout = setTimeout(() => {
            const marker = this.xterm.registerMarker(
                range.start.y -
                    (this.xterm.buffer.active.baseY +
                        this.xterm.buffer.active.cursorY +
                        1)
            );
            this.tooltip = this.xterm.registerDecoration({
                marker,
                x: range.start.x - 1,
                width: range.end.x - (range.start.x - 1),
            });
            const tooltipRenderedEvent = this.tooltip?.onRender((element) => {
                const tooltipAnchor = document.createElement("div");
                tooltipAnchor.style.position = "relative";

                const tooltipWrapper = document.createElement("div");

                tooltipWrapper.style.position = "absolute";
                tooltipWrapper.style.bottom = "0";
                tooltipWrapper.style.paddingBottom = "4px";

                const tooltip = document.createElement("div");
                tooltip.classList.add("tooltip", "link");

                const link = document.createElement("a");
                link.innerText = uri;
                link.href = uri;
                link.addEventListener("click", (e) => {
                    e.preventDefault();
                    // eslint-disable-next-line @typescript-eslint/no-floating-promises
                    invoke("utils_open_uri", { uri });
                });
                tooltip.appendChild(link);

                if (this.hyperlinkModifiers.length > 0) {
                    const hyperlinkTipElement = document.createElement("span");
                    const linkOpenTip = this.hyperlinkModifiers
                        .map((m) => `<kbd>${m}</kbd>`)
                        .concat("<kbd>click</kbd>");
                    hyperlinkTipElement.innerHTML = linkOpenTip.join("+");
                    tooltip.appendChild(hyperlinkTipElement);
                }

                tooltipWrapper.appendChild(tooltip);
                tooltipAnchor.appendChild(tooltipWrapper);

                element.appendChild(tooltipAnchor);
                element.classList.add("highlight");
                element.addEventListener("mouseleave", () => {
                    marker.dispose();
                    this.tooltip!.dispose();
                    this.tooltip = undefined;
                });

                setTimeout(() => {
                    if (tooltipWrapper.clientHeight > element.offsetTop) {
                        tooltipWrapper.style.paddingBottom = "";
                        tooltipWrapper.style.bottom = "";
                        tooltipWrapper.style.top = `${element.style.height}`;
                        tooltipWrapper.style.paddingTop = "4px";
                    }
                    if (
                        tooltipWrapper.clientWidth >
                        this.element.clientWidth - element.offsetLeft
                    ) {
                        tooltipWrapper.style.right = "0";
                        tooltipAnchor.style.translate = `${
                            this.element.clientWidth -
                            element.offsetLeft -
                            tooltipAnchor.clientWidth
                        }px`;
                    }
                }, 0);

                tooltipRenderedEvent!.dispose();
            });
        }, 1000);
    }

    private onLinkLeaved() {
        clearTimeout(this.tooltipPopTimeout);
    }

    private onLinkClicked(e: MouseEvent, uri: string) {
        const pressedModifiers = [];
        if (e.ctrlKey) pressedModifiers.push("ctrl");
        if (e.altKey) pressedModifiers.push("alt");
        if (e.shiftKey) pressedModifiers.push("shift");
        if (e.metaKey) pressedModifiers.push("meta");

        if (
            pressedModifiers.length === this.hyperlinkModifiers.length &&
            pressedModifiers.every((m) => this.hyperlinkModifiers.includes(m))
        ) {
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            invoke("utils_open_uri", { uri });
        }
    }
}
