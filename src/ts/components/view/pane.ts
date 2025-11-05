import { PopupBuilder, PopupButton } from "@/components/interface/popup";
import Widget from "@/components/view/widgets/base";

import PopupManager from "@/managers/popup";

import {
    PaneOutOfCapacityError,
    SelectSpecificPathRejectionReason,
    UnkownSplitPathError,
    ViewSelectSpecificPaneError,
} from "@/schemas/error";

import computeLayout from "@/utils/tilling";

export default class Pane {
    private popupManager: PopupManager;
    private viewAnchoring: HTMLElement;

    uuid: string;
    content?: Widget | Pane[];
    element: HTMLElement;

    private isSubview: boolean = false;

    private inSpecificSelection: boolean = false;
    private keydownListener?: (this: Document, ev: KeyboardEvent) => void;

    private onceClosed: (uuid: string) => void;
    private onWidgetClosed: (uuid: string) => void;

    resizeObserver: ResizeObserver;

    private colsSpan: number = 1;
    private rowsSpan: number = 1;

    constructor(
        target: HTMLElement,
        uuid: string,
        popupManager: PopupManager,
        viewAnchoring: HTMLElement,
        onceClosed: (uuid: string) => void,
        onWidgetClosed: (uuid: string) => void,
        widget?: Widget
    ) {
        this.popupManager = popupManager;
        this.viewAnchoring = viewAnchoring;

        this.onWidgetClosed = onWidgetClosed;
        this.onceClosed = onceClosed;

        this.uuid = uuid;

        this.element = Pane.generateComponent();

        if (widget) {
            widget.anchoringPane = this;
            this.content = widget;
            this.element.appendChild(widget.element);

            widget.onceClosed = () => {
                this.onWidgetClosed(widget.uuid);
                this.onContentClosed(widget.uuid);
            };
            widget.run();
        }

        target.appendChild(this.element);

        this.resizeObserver = new ResizeObserver(() => {
            this.reflowLayout();
        });
        this.resizeObserver.observe(this.element);
    }

    split(widget: Widget) {
        if (this.isSubview && (this.content as Pane[]).length >= 36) {
            throw new PaneOutOfCapacityError("Unable to split pane", widget);
        }

        if (!this.isSubview) {
            (this.content as Widget).blur();
            this.isSubview = true;
            this.element.classList.add("subview");
            const innerPane = new Pane(
                this.element,
                crypto.randomUUID(),
                this.popupManager,
                this.viewAnchoring,
                (id) => this.onContentClosed(id),
                (id) => this.onWidgetClosed(id),
                undefined
            );
            innerPane.element.appendChild((this.content as Widget).element);
            const previousContent = this.content as Widget;

            previousContent.onceClosed = () => {
                innerPane.onWidgetClosed(previousContent.uuid);
                innerPane.onContentClosed(previousContent.uuid);
            };
            previousContent.anchoringPane = innerPane;
            innerPane.content = this.content;
            this.content = [innerPane];
        }

        const newPane = new Pane(
            this.element,
            crypto.randomUUID(),
            this.popupManager,
            this.viewAnchoring,
            (id) => this.onContentClosed(id),
            (id) => this.onWidgetClosed(id),
            widget
        );
        (this.content as Pane[]).push(newPane);
        this.reflowLayout();
    }

    private onContentClosed(uuid: string) {
        if (this.isSubview) {
            const paneIndex = (this.content as Pane[]).findIndex(
                (pane) => pane.uuid === uuid
            );

            const removedPane = (this.content as Pane[]).splice(
                paneIndex,
                1
            )[0];
            removedPane.element.remove();
            removedPane.resizeObserver.disconnect();

            if ((this.content as Pane[]).length === 1) {
                const innerPane = (this.content as Pane[])[0];

                const computedStyle = getComputedStyle(this.element);
                innerPane.element.style.setProperty(
                    "--cols-span",
                    computedStyle.getPropertyValue("--cols-span")
                );
                innerPane.element.style.setProperty(
                    "--rows-span",
                    computedStyle.getPropertyValue("--rows-span")
                );
                this.element.parentElement!.replaceChild(
                    innerPane.element,
                    this.element
                );
                this.isSubview = innerPane.isSubview;
                this.element = innerPane.element;
                this.content = innerPane.content;

                if (this.isSubview) {
                    (innerPane.content as Pane[]).forEach((pane) => {
                        pane.onceClosed = (id) => this.onContentClosed(id);
                        pane.onWidgetClosed = (id) => this.onWidgetClosed(id);
                    });
                } else {
                    const widget = this.content as Widget;
                    widget.anchoringPane = this;
                    widget.onceClosed = () => {
                        this.onWidgetClosed(widget.uuid);
                        this.onContentClosed(widget.uuid);
                    };
                }
            }

            this.reflowLayout();
        } else {
            this.onceClosed(this.uuid);
        }
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
            this.element.classList.add("indexed");
            let selectedIndex: number = 0;
            (this.content as Pane[]).forEach((pane, i) => {
                pane.element.classList.toggle(
                    "unselected",
                    i !== selectedIndex
                );
                pane.element.classList.remove(
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
                        this.element.classList.remove("indexed");

                        if (
                            (e.key === "Enter" && e.ctrlKey) ||
                            e.key !== "Enter"
                        ) {
                            if (e.key === "Backspace") {
                                reject(
                                    new ViewSelectSpecificPaneError(
                                        SelectSpecificPathRejectionReason.Backward
                                    )
                                );
                            } else if (e.key === "Escape") {
                                reject(
                                    new ViewSelectSpecificPaneError(
                                        SelectSpecificPathRejectionReason.UserAborted
                                    )
                                );
                            } else {
                                resolve([selectedIndex]);
                            }

                            (this.content as Pane[]).forEach((pane, i) => {
                                pane.element.classList.remove("unselected");
                                pane.element.classList.add(
                                    "fade-out-background",
                                    "fade-out-index"
                                );
                                pane.element.setAttribute(
                                    "data-index",
                                    i.toString(36)
                                );
                            });
                        } else {
                            try {
                                const currentPanes = this.content as Pane[];
                                currentPanes.forEach((pane, i) => {
                                    pane.element.setAttribute(
                                        "data-index",
                                        i.toString(36)
                                    );
                                    pane.element.classList.add(
                                        "fade-out-index"
                                    );
                                });
                                setTimeout(() => {
                                    currentPanes.forEach((pane) => {
                                        pane.element.classList.remove(
                                            "fade-out-index"
                                        );
                                    });
                                }, 100);

                                const partialPath =
                                    (await (this.content as Pane[])[
                                        selectedIndex
                                    ]?.selectSpecific()) ??
                                    reject(
                                        new ViewSelectSpecificPaneError(
                                            SelectSpecificPathRejectionReason.AppAborted,
                                            "The selected pane is unreachable."
                                        )
                                    );
                                (this.content as Pane[]).forEach((pane) => {
                                    pane.element.classList.remove("unselected");
                                    pane.element.classList.add(
                                        "fade-out-background"
                                    );
                                });
                                partialPath.unshift(selectedIndex);
                                resolve(partialPath);
                            } catch (e) {
                                if (
                                    e instanceof ViewSelectSpecificPaneError &&
                                    e.type ===
                                        SelectSpecificPathRejectionReason.Backward
                                ) {
                                    document.addEventListener(
                                        "keydown",
                                        this.keydownListener!,
                                        { capture: true }
                                    );
                                    this.inSpecificSelection = true;
                                    this.element.classList.add("indexed");
                                    (this.content as Pane[]).forEach(
                                        (pane, i) => {
                                            pane.element.classList.toggle(
                                                "unselected",
                                                i !== selectedIndex
                                            );
                                        }
                                    );
                                } else {
                                    (this.content as Pane[]).forEach((pane) => {
                                        pane.element.classList.remove(
                                            "unselected"
                                        );
                                        pane.element.classList.add(
                                            "fade-out-background"
                                        );
                                    });
                                    reject(e);
                                }
                            }
                        }
                        const currentPanes = this.content as Pane[];
                        setTimeout(() => {
                            currentPanes.forEach((pane) => {
                                pane.element.classList.remove(
                                    "fade-out-background",
                                    "fade-out-index"
                                );
                            });
                        }, 100);
                    } else {
                        let newSelectedIndex: number = NaN;
                        const panesCount = (this.content as Pane[]).length;
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
                                newSelectedIndex = Number.parseInt(e.key, 36);
                        }

                        if (
                            !Number.isNaN(newSelectedIndex) &&
                            newSelectedIndex >= 0 &&
                            newSelectedIndex < panesCount
                        ) {
                            selectedIndex = newSelectedIndex;
                            (this.content as Pane[]).forEach((pane, i) => {
                                pane.element.classList.toggle(
                                    "unselected",
                                    i !== selectedIndex
                                );
                            });
                        }
                    }
                }),
                { capture: true }
            );
        });
    }

    private reflowLayout() {
        if (this.isSubview) {
            if (this.element.clientWidth && this.element.clientHeight) {
                const layout = computeLayout(
                    this.element.clientWidth,
                    this.element.clientHeight,
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
                    pane.element.style.setProperty(
                        "--cols-span",
                        `${this.colsSpan}`
                    );
                    pane.element.style.setProperty(
                        "--rows-span",
                        `${this.rowsSpan}`
                    );
                });
            }
        } else {
            (this.content as Widget).element.style.setProperty(
                "--cols-span",
                "1"
            );
            (this.content as Widget).element.style.setProperty(
                "--rows-span",
                "1"
            );
        }
    }

    closeSpecific(path: number[]): Promise<void> {
        if (path.length === 0 || !this.isSubview) {
            return this.requestClosing();
        }
        return (this.content as Pane[])[path[0]].closeSpecific(path.slice(1));
    }

    async requestClosing() {
        if (this.isSubview) {
            const cancelButton = new PopupButton("cancel", "dismiss");
            const confirmButton = new PopupButton("confirm", "validate");
            if (
                !settings.closeConfirmation.group ||
                (
                    await this.popupManager.sendPopup(
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
        } else if (await (this.content as Widget).getClosability()) {
            await (this.content as Widget).close();
        } else {
            const cancelButton = new PopupButton("cancel", "dismiss");
            const confirmButton = new PopupButton("confirm", "validate");
            if (
                (
                    await this.popupManager.sendPopup(
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
