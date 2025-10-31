import { Profile } from "schemas/settings";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import {
    IBufferRange,
    IDecoration,
    IMarker,
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

    private tooltip?: IDecoration[];
    private tooltipMarkers?: IMarker[];
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
            minimumContrastRatio: profile.terminalSettings.minimumContrastRatio,
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
        this.xterm.onScroll(() => this.disposeTooltip());

        this.xterm.attachCustomKeyEventHandler((e) =>
            this.onTerminalKeyPress(e)
        );
        this.xterm.attachCustomWheelEventHandler((e) => {
            if (
                ((this.xterm.buffer.active.viewportY <
                    this.xterm.buffer.active.baseY &&
                    e.deltaY > 0) ||
                    (this.xterm.buffer.active.viewportY > 0 && e.deltaY < 0)) &&
                this.tooltip
            ) {
                this.disposeTooltip();
            }
            return true;
        });

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
        this.disposeTooltip();
        const proposedDimensions = this.xtermFitAddon.proposeDimensions();
        if (proposedDimensions?.cols && proposedDimensions.rows) {
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
            [this.tooltip, this.tooltipMarkers] = this.highlightRange(range);

            this.tooltip.forEach((tooltip, i) => {
                const tooltipRenderedEvent = tooltip.onRender((element) => {
                    tooltipRenderedEvent.dispose();
                    element.addEventListener("mouseleave", (e) => {
                        if (
                            !(
                                e.relatedTarget as HTMLElement | null
                            )?.classList.contains("highlight")
                        ) {
                            this.disposeTooltip();
                        }
                    });

                    if (i !== 0) {
                        return;
                    }
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
                        const hyperlinkTipElement =
                            document.createElement("span");
                        const linkOpenTip = this.hyperlinkModifiers
                            .map((m) => `<kbd>${m}</kbd>`)
                            .concat("<kbd>click</kbd>");
                        hyperlinkTipElement.innerHTML = linkOpenTip.join("+");
                        tooltip.appendChild(hyperlinkTipElement);
                    }

                    tooltipWrapper.appendChild(tooltip);
                    tooltipAnchor.appendChild(tooltipWrapper);

                    element.appendChild(tooltipAnchor);

                    setTimeout(() => {
                        if (tooltipWrapper.clientHeight > element.offsetTop) {
                            tooltipWrapper.style.paddingBottom = "";
                            tooltipWrapper.style.bottom = "";
                            tooltipWrapper.style.top = `${
                                element.clientHeight *
                                (range.end.y - range.start.y + 1)
                            }px`;
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
                });
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

    private highlightRange(
        range: IBufferRange | IViewportRange
    ): [IDecoration[], IMarker[]] {
        const highlight = [];
        const highlightMarkers = [];

        if (range.end.x === 0) {
            range.end.x = this.xterm.cols;
            range.end.y--;
        }

        const lineCount = range.end.y - range.start.y + 1;
        for (let lineIndex = 0; lineIndex < lineCount; lineIndex++) {
            highlightMarkers.push(
                this.xterm.registerMarker(
                    range.start.y -
                        (this.xterm.buffer.active.baseY +
                            this.xterm.buffer.active.cursorY +
                            1 -
                            lineIndex)
                )
            );
            const startPos = lineIndex === 0 ? range.start.x - 1 : 0;
            const endPos =
                lineIndex === lineCount - 1 ? range.end.x : this.xterm.cols;
            highlight.push(
                this.xterm.registerDecoration({
                    marker: highlightMarkers[lineIndex],
                    x: startPos,
                    width: endPos - startPos,
                })!
            );
            const tooltipRenderedEvent = highlight[lineIndex].onRender(
                (element) => {
                    tooltipRenderedEvent.dispose();
                    element.classList.add("highlight");

                    if (
                        lineIndex === 0 &&
                        range.start.x > 1 &&
                        (lineCount > 2 ||
                            (lineCount === 2 && range.end.x >= range.start.x))
                    ) {
                        element.classList.add("bl-corner-inv");
                    }
                    if (
                        lineIndex === lineCount - 1 &&
                        range.end.x < this.xterm.cols &&
                        (lineCount > 2 ||
                            (lineCount === 2 && range.end.x >= range.start.x))
                    ) {
                        element.classList.add("tr-corner-inv");
                    }

                    if (lineCount === 2) {
                        if (range.start.x <= range.end.x) {
                            if (lineIndex === 0) {
                                element.style.borderBottomLeftRadius = "0";
                                if (range.end.x === this.xterm.cols) {
                                    element.style.borderBottomRightRadius = "0";
                                }
                            } else {
                                element.style.borderTopRightRadius = "0";
                                if (range.start.x === 1) {
                                    element.style.borderTopLeftRadius = "0";
                                }
                            }
                        }
                    } else if (lineCount >= 3) {
                        element.style.borderTopLeftRadius = "0";
                        element.style.borderTopRightRadius = "0";
                        element.style.borderBottomLeftRadius = "0";
                        element.style.borderBottomRightRadius = "0";

                        if (lineIndex === 0) {
                            element.style.borderTopLeftRadius = "";
                            element.style.borderTopRightRadius = "";
                            element.classList.add("aa");
                        } else if (lineIndex === 1 && range.start.x > 1) {
                            element.style.borderTopLeftRadius = "";
                        } else if (
                            lineIndex === lineCount - 2 &&
                            range.end.x < this.xterm.cols
                        ) {
                            element.style.borderBottomRightRadius = "";
                        } else if (lineIndex === lineCount - 1) {
                            element.style.borderBottomLeftRadius = "";
                            element.style.borderBottomRightRadius = "";
                        }
                    }
                }
            );
        }

        return [highlight, highlightMarkers];
    }

    private disposeTooltip() {
        if (!this.tooltip) {
            return;
        }
        this.tooltip.forEach((t) => {
            t.dispose();
        });
        this.tooltipMarkers!.forEach((m) => {
            m.dispose();
        });
        this.tooltip = undefined;
        this.tooltipMarkers = undefined;
    }
}
