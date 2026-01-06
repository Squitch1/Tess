import { UUID } from "crypto";

import { PopupBuilder, PopupButton } from "@/components/interface/popup";
import Widget from "@/components/view/widgets/base";

import {
    PaneOutOfCapacityError,
    SelectSpecificPathRejectionReason,
    UnkownSplitPathError,
    ViewSelectSpecificPaneError,
} from "@/schemas/error";

import computeLayout from "@/utils/tilling";

export default class Pane extends EventTarget {
    readonly id: UUID;
    #element: HTMLElement;

    private content?: Widget | Pane[];

    private isSubview: boolean = false;
    private inSpecificSelection: boolean = false;
    private colsSpan: number = 1;
    private rowsSpan: number = 1;

    private viewAnchoring: HTMLElement;
    private resizeObserver: ResizeObserver;

    private keydownListener?: (this: Document, ev: KeyboardEvent) => void;

    private onceWidgetClosedListener: () => void;
    private onceContentClosedListener: (e: CustomEventInit<UUID>) => void;

    constructor(viewAnchoring: HTMLElement, widget?: Widget) {
        super();

        this.viewAnchoring = viewAnchoring;

        this.id = crypto.randomUUID();

        this.#element = Pane.generateComponent();

        this.onceWidgetClosedListener = () => this.onContentClosed();
        this.onceContentClosedListener = (e) => this.onContentClosed(e.detail);

        this.resizeObserver = new ResizeObserver(() => this.reflowLayout());

        if (widget) {
            this.setWidget(widget);
        }
    }

    get element() {
        return this.#element;
    }

    setWidget(widget: Widget) {
        widget.anchoringPane = this;
        this.content = widget;
        this.#element.appendChild(widget.element);

        widget.addEventListener("close", this.onceWidgetClosedListener, {
            once: true,
        });
        this.resizeObserver.observe(this.#element);
    }

    split(widget: Widget) {
        if (
            this.isSubview &&
            (this.content as Pane[]).length >= MAX_SPLITS_PER_PANE
        ) {
            throw new PaneOutOfCapacityError("Unable to split pane", widget);
        }

        if (!this.isSubview) {
            const widget = this.content as Widget;
            widget.removeEventListener("close", this.onceWidgetClosedListener);
            const innerPane = new Pane(this.viewAnchoring, widget);
            innerPane.addEventListener(
                "close",
                this.onceContentClosedListener,
                { once: true }
            );
            this.#element.classList.add("subview");
            this.#element.appendChild(innerPane.#element);
            this.content = [innerPane];
            this.isSubview = true;
        }

        const newPane = new Pane(this.viewAnchoring, widget);
        newPane.addEventListener("close", this.onceContentClosedListener, {
            once: true,
        });
        this.#element.appendChild(newPane.#element);
        (this.content as Pane[]).push(newPane);
        this.reflowLayout();
    }

    private onContentClosed(paneId?: UUID) {
        if (!this.isSubview) {
            this.dispatchEvent(new CustomEvent("close", { detail: this.id }));
            return;
        }

        const panes = this.content as Pane[];
        const removedPane = panes.splice(
            panes.findIndex((pane) => pane.id === paneId),
            1
        )[0];
        removedPane.#element.remove();
        removedPane.resizeObserver.disconnect();

        if (panes.length === 1) {
            const innerPane = panes[0];

            const computedStyle = getComputedStyle(this.#element);
            innerPane.#element.style.setProperty(
                "--cols-span",
                computedStyle.getPropertyValue("--cols-span")
            );
            innerPane.#element.style.setProperty(
                "--rows-span",
                computedStyle.getPropertyValue("--rows-span")
            );
            this.#element.parentElement!.replaceChild(
                innerPane.#element,
                this.#element
            );
            this.isSubview = innerPane.isSubview;
            this.#element = innerPane.#element;
            this.content = innerPane.content;

            if (this.isSubview) {
                (innerPane.content as Pane[]).forEach((pane) => {
                    pane.removeEventListener(
                        "close",
                        innerPane.onceContentClosedListener
                    );
                    pane.addEventListener(
                        "close",
                        this.onceContentClosedListener,
                        { once: true }
                    );
                });
            } else {
                const widget = this.content as Widget;
                widget.anchoringPane = this;
                widget.removeEventListener(
                    "close",
                    innerPane.onceWidgetClosedListener
                );
                widget.addEventListener(
                    "close",
                    this.onceWidgetClosedListener,
                    { once: true }
                );
            }
        }

        this.reflowLayout();
    }

    splitSpecific(widget: Widget, path: number[]) {
        if (path.length === 0 || !this.isSubview) {
            this.split(widget);
        } else {
            const nextPane = (this.content as Pane[]).at(path[0]);
            if (nextPane) {
                nextPane.splitSpecific(widget, path.slice(1));
            } else {
                throw new UnkownSplitPathError(widget);
            }
        }
    }

    selectSpecific(): Promise<number[]> {
        if (!this.isSubview) {
            return Promise.resolve([]);
        }

        return new Promise<number[]>((resolve, reject) => {
            const panes = this.content as Pane[];

            this.#element.classList.add("indexed");
            let selectedIndex: number = 0;
            panes.forEach((pane, i) => {
                pane.#element.classList.toggle(
                    "unselected",
                    i !== selectedIndex
                );
                pane.#element.classList.remove(
                    "fade-out-background",
                    "fade-out-index"
                );
            });
            this.inSpecificSelection = true;
            document.addEventListener(
                "keydown",
                (this.keydownListener = async (e) => {
                    e.preventDefault();
                    e.stopImmediatePropagation();

                    if (
                        e.key === "Enter" ||
                        e.key === "Escape" ||
                        e.key === "Backspace"
                    ) {
                        document.removeEventListener(
                            "keydown",
                            this.keydownListener!,
                            { capture: true }
                        );
                        this.inSpecificSelection = false;
                        this.#element.classList.remove("indexed");

                        if (
                            (e.key === "Enter" && e.ctrlKey) ||
                            e.key !== "Enter"
                        ) {
                            if (e.key === "Backspace") {
                                reject(
                                    new ViewSelectSpecificPaneError(
                                        SelectSpecificPathRejectionReason.backward
                                    )
                                );
                            } else if (e.key === "Escape") {
                                reject(
                                    new ViewSelectSpecificPaneError(
                                        SelectSpecificPathRejectionReason.userAborted
                                    )
                                );
                            } else {
                                resolve([selectedIndex]);
                            }

                            panes.forEach((pane, i) => {
                                pane.#element.classList.remove("unselected");
                                pane.#element.classList.add(
                                    "fade-out-background",
                                    "fade-out-index"
                                );
                                pane.#element.setAttribute(
                                    "data-index",
                                    i.toString(MAX_SPLITS_PER_PANE)
                                );
                            });
                        } else {
                            try {
                                panes.forEach((pane, i) => {
                                    pane.#element.setAttribute(
                                        "data-index",
                                        i.toString(MAX_SPLITS_PER_PANE)
                                    );
                                    pane.#element.classList.add(
                                        "fade-out-index"
                                    );
                                });
                                setTimeout(
                                    () =>
                                        panes.forEach((pane) => {
                                            pane.#element.classList.remove(
                                                "fade-out-index"
                                            );
                                        }),
                                    100
                                );

                                const partialPath = await panes
                                    .at(selectedIndex)
                                    ?.selectSpecific();
                                if (!partialPath) {
                                    reject(
                                        new ViewSelectSpecificPaneError(
                                            SelectSpecificPathRejectionReason.appAborted,
                                            "The selected pane is unreachable."
                                        )
                                    );
                                    return;
                                }

                                panes.forEach((pane) => {
                                    pane.#element.classList.remove(
                                        "unselected"
                                    );
                                    pane.#element.classList.add(
                                        "fade-out-background"
                                    );
                                });
                                partialPath.unshift(selectedIndex);
                                resolve(partialPath);
                            } catch (e) {
                                if (
                                    e instanceof ViewSelectSpecificPaneError &&
                                    e.type ===
                                        SelectSpecificPathRejectionReason.backward
                                ) {
                                    document.addEventListener(
                                        "keydown",
                                        this.keydownListener!,
                                        { capture: true }
                                    );
                                    this.inSpecificSelection = true;
                                    this.#element.classList.add("indexed");
                                    panes.forEach((pane, i) =>
                                        pane.#element.classList.toggle(
                                            "unselected",
                                            i !== selectedIndex
                                        )
                                    );
                                } else {
                                    panes.forEach((pane) => {
                                        pane.#element.classList.remove(
                                            "unselected"
                                        );
                                        pane.#element.classList.add(
                                            "fade-out-background"
                                        );
                                    });
                                    reject(e);
                                }
                            }
                        }
                        setTimeout(
                            () =>
                                panes.forEach((pane) =>
                                    pane.#element.classList.remove(
                                        "fade-out-background",
                                        "fade-out-index"
                                    )
                                ),
                            100
                        );
                    } else {
                        let newSelectedIndex: number = NaN;
                        const panesCount = panes.length;
                        switch (e.code) {
                            case "Tab":
                                if (e.shiftKey) {
                                    newSelectedIndex =
                                        selectedIndex === 0
                                            ? panesCount - 1
                                            : selectedIndex - 1;
                                } else {
                                    newSelectedIndex =
                                        (selectedIndex + 1) % panesCount;
                                }
                                break;
                            case "ArrowLeft":
                                if (selectedIndex % this.colsSpan !== 0) {
                                    newSelectedIndex = selectedIndex - 1;
                                }
                                break;
                            case "ArrowRight":
                                if ((selectedIndex + 1) % this.colsSpan !== 0) {
                                    newSelectedIndex = selectedIndex + 1;
                                }
                                break;
                            case "ArrowDown":
                                if (
                                    Math.floor(selectedIndex / this.colsSpan) <
                                    this.rowsSpan - 2
                                ) {
                                    newSelectedIndex =
                                        selectedIndex + this.colsSpan;
                                } else if (
                                    Math.floor(selectedIndex / this.colsSpan) <
                                    this.rowsSpan - 1
                                ) {
                                    const x =
                                        ((selectedIndex % this.colsSpan) /
                                            this.colsSpan) *
                                        (panesCount -
                                            this.colsSpan *
                                                (this.rowsSpan - 1));

                                    newSelectedIndex =
                                        (this.rowsSpan - 1) * this.colsSpan +
                                        (x - Math.floor(x) === 0.5
                                            ? Math.floor(x)
                                            : Math.round(x));
                                }
                                break;
                            case "ArrowUp":
                                if (
                                    Math.floor(selectedIndex / this.colsSpan) <
                                    this.rowsSpan - 1
                                ) {
                                    newSelectedIndex =
                                        selectedIndex - this.colsSpan;
                                } else if (
                                    Math.floor(
                                        selectedIndex / this.colsSpan
                                    ) ===
                                    this.rowsSpan - 1
                                ) {
                                    newSelectedIndex =
                                        (this.rowsSpan - 2) * this.colsSpan +
                                        Math.round(
                                            (((selectedIndex -
                                                (this.rowsSpan - 1) *
                                                    this.colsSpan) %
                                                (panesCount -
                                                    this.colsSpan *
                                                        (this.rowsSpan - 1))) /
                                                (panesCount -
                                                    this.colsSpan *
                                                        (this.rowsSpan - 1))) *
                                                this.colsSpan
                                        );
                                }
                                break;
                            default:
                                newSelectedIndex = Number.parseInt(
                                    e.key,
                                    MAX_SPLITS_PER_PANE
                                );
                        }

                        if (
                            !Number.isNaN(newSelectedIndex) &&
                            newSelectedIndex >= 0 &&
                            newSelectedIndex < panesCount
                        ) {
                            selectedIndex = newSelectedIndex;
                            panes.forEach((pane, i) =>
                                pane.#element.classList.toggle(
                                    "unselected",
                                    i !== selectedIndex
                                )
                            );
                        }
                    }
                }),
                { capture: true }
            );
        });
    }

    private reflowLayout() {
        if (!this.isSubview) {
            (this.content as Widget).element.style.setProperty(
                "--cols-span",
                "1"
            );
            (this.content as Widget).element.style.setProperty(
                "--rows-span",
                "1"
            );
            return;
        }

        if (this.#element.clientWidth && this.#element.clientHeight) {
            const layout = computeLayout(
                this.#element.clientWidth,
                this.#element.clientHeight,
                (this.content as Pane[]).length
            );

            this.colsSpan = Math.min(
                layout[0],
                (this.content as Pane[]).length
            );
            this.rowsSpan = Math.min(
                layout[1],
                (this.content as Pane[]).length
            );

            (this.content as Pane[]).forEach((pane) => {
                pane.#element.style.setProperty(
                    "--cols-span",
                    `${this.colsSpan}`
                );
                pane.#element.style.setProperty(
                    "--rows-span",
                    `${this.rowsSpan}`
                );
            });
        }
    }

    closeSpecific(path: number[]): Promise<void> {
        if (path.length === 0 || !this.isSubview) {
            return this.requestClosing();
        }
        return (this.content as Pane[])[path[0]].closeSpecific(path.slice(1));
    }

    async requestClosing() {
        const cancelButton = new PopupButton("cancel", "dismiss");
        const confirmButton = new PopupButton("confirm", "validate");

        if (this.isSubview) {
            if (
                !settings.closeConfirmation.group ||
                (
                    await popupManager.sendPopup(
                        new PopupBuilder(
                            `Confirm close of ${this.widgetsCount()} widgets`
                        )
                            .withMessage("Are you sure to close these widgets?")
                            .withButtons(cancelButton, confirmButton),
                        this.viewAnchoring
                    )
                ).action === "confirm"
            ) {
                await this.close();
            }
        } else if (
            (await (this.content as Widget).getClosability()) ||
            (
                await popupManager.sendPopup(
                    new PopupBuilder(
                        `Confirm close of ${await (
                            this.content as Widget
                        ).getShortTitle()}`
                    )
                        .withMessage("Are you sure to close this widget?")
                        .withButtons(cancelButton, confirmButton),
                    this.viewAnchoring
                )
            ).action === "confirm"
        ) {
            await (this.content as Widget).close();
        }
    }

    async close(): Promise<void> {
        if (this.isSubview) {
            await Promise.all(
                (this.content as Pane[]).map((pane) => pane.close())
            );
        } else {
            await (this.content as Widget).close();
        }
    }

    resumeSpecificSelection(): boolean {
        if (this.inSpecificSelection) {
            document.addEventListener("keydown", this.keydownListener!, {
                capture: true,
            });
            return true;
        }
        if (this.isSubview) {
            return (this.content as Pane[])
                .map((pane) => pane.resumeSpecificSelection())
                .reduce((previous, current) => previous || current);
        }

        return false;
    }

    pauseSpecificSelection() {
        if (this.inSpecificSelection) {
            document.removeEventListener("keydown", this.keydownListener!, {
                capture: true,
            });
        } else if (this.isSubview) {
            (this.content as Pane[]).forEach((pane) =>
                pane.pauseSpecificSelection()
            );
        }
    }

    private widgetsCount(): number {
        if (this.isSubview) {
            return (this.content as Pane[]).reduce<number>(
                (count: number, pane) => count + pane.widgetsCount(),
                0
            );
        }
        return 1;
    }

    private static generateComponent(): HTMLDivElement {
        const element = document.createElement("div");
        element.classList.add("pane");

        return element;
    }
}
