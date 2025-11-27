import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { CanvasAddon } from "@xterm/addon-canvas";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import {
    IBufferRange,
    IDecoration,
    IMarker,
    IViewportRange,
    Terminal as Xterm,
} from "@xterm/xterm";

import { Profile } from "@/schemas/settings";

import Widget from "./base";

type TerminalCallbacks = {
    closable: () => Promise<boolean>;
    leaderName: () => Promise<string>;
    exit: () => Promise<void>;
    keyPress: (e: KeyboardEvent) => boolean;
};

export default class Terminal extends Widget {
    readonly xterm: Xterm;
    private root: HTMLDivElement;

    private fitAddon: FitAddon;

    private callbacks: TerminalCallbacks;

    private resizeObserver: ResizeObserver;

    private tooltip?: IDecoration[];
    private tooltipMarkers?: IMarker[];
    private tooltipPopTimeout?: ReturnType<typeof setTimeout>;
    private hyperlinkModifiers: string[];

    constructor(profile: Profile, callbacks: TerminalCallbacks) {
        super();

        this.callbacks = callbacks;

        let background;
        [this.root, background] = Terminal.generateComponent(profile);
        if (background) {
            this.element.appendChild(background);
        }
        this.element.appendChild(this.root);

        this.hyperlinkModifiers = profile.terminalSettings.hyperlinkModifier
            .toLowerCase()
            .replaceAll(" ", "")
            .split("+")
            .filter((m) => m !== "");

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

        this.fitAddon = new FitAddon();

        this.xterm.loadAddon(this.fitAddon);
        this.xterm.loadAddon(new CanvasAddon());
        this.xterm.loadAddon(
            new WebLinksAddon((e, uri) => this.onLinkClicked(e, uri), {
                hover: (_, uri, range) => this.onLinkHovered(uri, range),
                leave: () => this.onLinkLeaved(),
            })
        );

        this.xterm.onData((data) =>
            this.dispatchEvent(new CustomEvent("data", { detail: data }))
        );
        this.xterm.onScroll(() => this.disposeTooltip());

        this.xterm.attachCustomKeyEventHandler((e) =>
            this.callbacks.keyPress(e)
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

        const onRender = this.xterm.onRender(() =>
            setTimeout(() => {
                this.resizeXterm();
            }, 0)
        );
        const onResize = this.xterm.onResize(() => {
            onRender.dispose();
            onResize.dispose();
        });

        this.resizeObserver = new ResizeObserver(() => this.resizeXterm());
    }

    run() {
        this.xterm.open(this.root);
        this.resizeObserver.observe(this.element);
    }

    getShortTitle(): Promise<string> {
        return this.callbacks.leaderName();
    }

    getClosability(): Promise<boolean> {
        return this.callbacks.closable();
    }

    async close(): Promise<void> {
        try {
            this.resizeObserver.disconnect();
            return this.callbacks.exit();
        } catch (e) {
            this.resizeObserver.observe(this.element);
            throw e;
        }
    }

    override focus() {
        this.xterm.focus();
    }

    override blur() {
        this.xterm.blur();
    }

    override dispose() {
        this.xterm.dispose();
        this.resizeObserver.disconnect();
    }

    private resizeXterm() {
        this.disposeTooltip();
        const dimensions = this.fitAddon.proposeDimensions();
        if (dimensions?.cols && dimensions.rows) {
            this.xterm.resize(dimensions.cols, dimensions.rows);
            this.dispatchEvent(
                new CustomEvent("resize", {
                    detail: dimensions,
                })
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
        this.tooltip.forEach((t) => t.dispose());
        this.tooltipMarkers!.forEach((m) => m.dispose());
        this.tooltip = undefined;
        this.tooltipMarkers = undefined;
    }

    private static generateComponent(
        profile: Profile
    ): [HTMLDivElement, HTMLImageElement?] {
        const element = document.createElement("div");
        element.classList.add("widget--term");

        let background;
        if (profile.background) {
            background = document.createElement("img");
            background.src = convertFileSrc(profile.background.location);
            background.classList.add("background-image");
            element.style.setProperty(
                "-webkit-backdrop-filter",
                `blur(${profile.background.blur}px)`
            );
        }

        element.style.setProperty(
            "--profile-background",
            profile.theme.background
        );
        element.style.setProperty(
            "--profile-background-transparency",
            `${profile.backgroundTransparency}%`
        );
        element.style.setProperty(
            "--terminal-highlight-color",
            profile.theme.highlight
        );

        return [element, background];
    }
}
