import { UUID } from "crypto";

import { PopupBuilder, PopupButton } from "@/components/interface/popup";
import Widget from "@/components/view/widgets/base";

import PopupManager from "@/managers/popup";
import Toaster from "@/managers/toast";

import {
    PaneOutOfCapacityError,
    SelectSpecificPathRejectionReason,
    UnkownSplitPathError,
    ViewSelectSpecificPaneError,
} from "@/schemas/error";

import computeLayout from "@/utils/tilling";

import Pane from "./pane";

export default class View {
    id: UUID;
    element: HTMLElement;

    onceClosed: () => void;

    onWidgetAdded: (widgetId: UUID) => void;
    onWidgetFocused: (widgetId: UUID) => void;
    onWidgetTitleUpdated: (widgetId: UUID, title: string) => void;
    onWidgetRequestHighlight: (widgetId: UUID) => void;
    onWidgetProgressUpdated: (widgetId: UUID, progress: number) => void;
    onWidgetClosed: (widgetId: UUID) => void;

    popupManager: PopupManager;
    toaster: Toaster;

    panes: Pane[] = [];
    widgets: Widget[] = [];

    focusHistory: string[] = [];
    focusedWidget?: Widget;

    private resizeObserver: ResizeObserver;

    private inSpecificSelection: boolean = false;
    private closingAllRequested: boolean = false;
    private widgetClosingRequested: boolean = false;
    private keydownListener?: (
        this: Document,
        ev: KeyboardEvent
    ) => Promise<void>;

    private colsSpan: number = 1;
    private rowsSpan: number = 1;

    constructor(viewId: UUID, popupManager: PopupManager, toaster: Toaster) {
        this.id = viewId;

        this.element = View.generateComponent();

        this.onceClosed = () => {};

        this.onWidgetAdded = () => {};
        this.onWidgetFocused = () => {};
        this.onWidgetTitleUpdated = () => {};
        this.onWidgetRequestHighlight = () => {};
        this.onWidgetProgressUpdated = () => {};
        this.onWidgetClosed = () => {};

        this.popupManager = popupManager;
        this.toaster = toaster;

        this.resizeObserver = new ResizeObserver(() => {
            this.reflowLayout();
        });
        this.resizeObserver.observe(this.element);
    }

    private reflowLayout() {
        if (this.element.clientWidth && this.element.clientHeight) {
            const layout = computeLayout(
                this.element.clientWidth,
                this.element.clientHeight,
                this.panes.length
            );

            this.colsSpan = Math.min(layout[0], this.panes.length);
            this.rowsSpan = Math.min(layout[1], this.panes.length);

            this.panes.forEach((pane) => {
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
    }

    private linkWidget(widget: Widget) {
        widget.onTitleUpdate = (title) =>
            this.onWidgetTitleUpdated(widget.id, title);
        widget.onHighlightRequest = () =>
            this.onWidgetRequestHighlight(widget.id);
        widget.onProgressUpdated = (progress) =>
            this.onWidgetProgressUpdated(widget.id, progress);

        widget.element.addEventListener("focusin", () => {
            if (this.focusHistory[0] !== widget.id) {
                this.focusHistory.unshift(widget.id);
            }

            this.focusedWidget = widget;
            this.onWidgetFocused(widget.id);
        });

        if (widget.initialTitle) {
            setTimeout(() => {
                this.onWidgetTitleUpdated(widget.id, widget.initialTitle!);
            }, 0);
        }
    }

    async addWidget(widget: Widget) {
        if (this.panes.length >= 36) {
            throw new PaneOutOfCapacityError("Unable to split tab", widget);
        }

        this.widgets.push(widget);
        const pane = new Pane(
            this.element,
            crypto.randomUUID(),
            this.popupManager,
            this.element,
            (paneId) => this.onPaneClosing(paneId),
            (widgetId) => this.onWidgetClosing(widgetId),
            widget
        );

        this.onWidgetAdded(widget.id);
        this.linkWidget(widget);

        this.element.appendChild(pane.element);
        this.panes.push(pane);
        this.reflowLayout();

        this.focusedWidget = widget;
    }

    private onWidgetClosing(widgetId: UUID) {
        const widget = this.widgets.find((widget) => widget.id === widgetId);
        if (widget) {
            widget.dispose();

            this.widgets.splice(this.widgets.indexOf(widget), 1);
            this.onWidgetClosed(widgetId);
            if (this.widgets.length === 0) {
                this.resizeObserver.disconnect();
                this.onceClosed();
            }
            this.focusHistory = this.focusHistory.filter(
                (id) => id !== widgetId
            );
            if (
                this.focusedWidget?.id === widgetId &&
                this.widgets.length > 0
            ) {
                const previouslyFocusedWidgetId = this.focusHistory.shift()!;
                this.focusedWidget = this.widgets.find(
                    (widget) => widget.id === previouslyFocusedWidgetId
                );
                this.onWidgetFocused(this.focusedWidget!.id);
            }
        }
    }

    private onPaneClosing(paneId: UUID) {
        const closedPane = this.panes.splice(
            this.panes.findIndex((pane) => pane.id === paneId),
            1
        )[0];
        closedPane.element.remove();
        closedPane.resizeObserver.disconnect();

        this.reflowLayout();
    }

    async close() {
        await Promise.all(this.widgets.map((widget) => widget.close()));
    }

    async closeWidget(widgetId: UUID) {
        await this.widgets.find((widget) => widget.id === widgetId)?.close();
    }

    cancelSelectSpecific() {
        if (this.inSpecificSelection) {
            document.addEventListener("keydown", this.keydownListener!, {
                capture: true,
            });
        }
        if (
            this.inSpecificSelection ||
            this.panes
                .map((pane) => pane.resumeSpecificSelection())
                .reduce((previous, current) => previous || current)
        ) {
            document.dispatchEvent(
                new KeyboardEvent("keydown", { key: "Escape" })
            );
        }
    }

    async requestClosing() {
        if (this.closingAllRequested) {
            return;
        }

        this.cancelSelectSpecific();

        if (this.widgets.length > 1) {
            this.closingAllRequested = true;
            const cancelButton = new PopupButton("cancel", "dismiss");
            const confirmButton = new PopupButton("confirm", "validate");
            try {
                if (
                    !settings.closeConfirmation.group ||
                    (
                        await this.popupManager.sendPopup(
                            new PopupBuilder(
                                `Confirm close of ${this.widgets.length} widgets`
                            )
                                .withMessage("Are you sure to close this tab?")
                                .withButtons(confirmButton, cancelButton),
                            this.element
                        )
                    ).action === "confirm"
                ) {
                    await this.close();
                }
            } finally {
                this.closingAllRequested = false;
            }
        } else {
            await this.requestWidgetClosing(this.widgets[0].id);
        }
    }

    async requestWidgetClosing(widgetId: UUID) {
        if (this.widgetClosingRequested) {
            return;
        }

        this.cancelSelectSpecific();

        const widget = this.widgets.find((widget) => widget.id === widgetId);

        if (widget) {
            this.widgetClosingRequested = true;
            try {
                if (!(await widget.getClosability())) {
                    const cancelButton = new PopupButton("cancel", "dismiss");
                    const confirmButton = new PopupButton(
                        "confirm",
                        "validate"
                    );
                    if (
                        (
                            await this.popupManager.sendPopup(
                                new PopupBuilder(
                                    `Confirm close of ${await widget.getShortTitle()}`
                                )
                                    .withMessage(
                                        "Are you sure to close this widget?"
                                    )
                                    .withButtons(cancelButton, confirmButton),
                                this.element
                            )
                        ).action === "confirm"
                    ) {
                        await this.closeWidget(widgetId);
                    }
                } else {
                    await this.closeWidget(widgetId);
                }
            } finally {
                this.widgetClosingRequested = false;
            }
        }
    }

    async requestClosingFocused() {
        this.cancelSelectSpecific();
        await this.focusedWidget?.anchoringPane?.requestClosing();
    }

    requestClosingSpecific(path: number[]): Promise<void> {
        this.cancelSelectSpecific();
        if (path.length === 0) {
            return this.requestClosing();
        }
        return this.panes[path[0]].closeSpecific(path.slice(1));
    }

    focus() {
        this.element.classList.add("visible");

        if (this.inSpecificSelection) {
            document.addEventListener("keydown", this.keydownListener!, {
                capture: true,
            });
        } else if (
            !this.panes
                .map((pane) => pane.resumeSpecificSelection())
                .reduce((previous, current) => previous || current)
        ) {
            this.focusedWidget?.focus();
        }
    }

    focusWidget(widgetId: UUID) {
        this.widgets.find((widget) => widget.id === widgetId)?.focus();
    }

    blur() {
        this.element.classList.remove("visible");

        this.focusedWidget?.blur();

        if (this.inSpecificSelection) {
            document.removeEventListener("keydown", this.keydownListener!, {
                capture: true,
            });
        }
        this.panes.forEach((pane) => {
            pane.pauseSpecificSelection();
        });
    }

    async splitFocusedWidget(widget: Widget) {
        if (this.widgets.length <= 1) {
            await this.addWidget(widget);
            return;
        }

        this.widgets.push(widget);
        this.linkWidget(widget);

        this.focusedWidget?.anchoringPane?.split(widget);

        this.focusedWidget = widget;
        this.onWidgetAdded(widget.id);
    }

    async splitSpecificWidget(widget: Widget, path: number[]) {
        if (path.length === 0) {
            await this.addWidget(widget);
            return;
        }

        const pane = this.panes.at(path[0]);
        if (!pane) {
            throw new UnkownSplitPathError(widget);
        }

        pane.splitSpecific(widget, path.slice(1));

        this.linkWidget(widget);
        this.widgets.push(widget);
        this.focusedWidget = widget;
        this.onWidgetAdded(widget.id);
    }

    selectSpecificPane(): Promise<number[]> {
        if (this.widgets.length <= 1) {
            return Promise.resolve([]);
        }

        return new Promise<number[]>((resolve, reject) => {
            this.focusedWidget?.blur();
            let selectedIndex = 0;
            this.element.classList.add("indexed");
            this.panes.forEach((pane, i) => {
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

                    if (e.key === "Enter" || e.key === "Escape") {
                        this.element.classList.remove("indexed");
                        document.removeEventListener(
                            "keydown",
                            this.keydownListener!,
                            { capture: true }
                        );
                        this.inSpecificSelection = false;

                        if (e.key === "Escape" || e.ctrlKey) {
                            this.panes.forEach((pane, i) => {
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
                            this.focusedWidget?.focus();

                            if (e.key === "Escape") {
                                reject(
                                    new ViewSelectSpecificPaneError(
                                        SelectSpecificPathRejectionReason.UserAborted
                                    )
                                );
                            } else {
                                resolve([selectedIndex]);
                            }
                        } else {
                            try {
                                this.panes.forEach((pane, i) => {
                                    pane.element.setAttribute(
                                        "data-index",
                                        i.toString(36)
                                    );
                                    pane.element.classList.add(
                                        "fade-out-index"
                                    );
                                });
                                setTimeout(() => {
                                    this.panes.forEach((pane) => {
                                        pane.element.classList.remove(
                                            "fade-out-index"
                                        );
                                    });
                                }, 100);

                                const partialPath =
                                    (await this.panes[
                                        selectedIndex
                                    ]?.selectSpecific()) ??
                                    reject(
                                        new ViewSelectSpecificPaneError(
                                            SelectSpecificPathRejectionReason.AppAborted,
                                            "The selected pane is unreachable."
                                        )
                                    );
                                this.panes.forEach((pane) => {
                                    pane.element.classList.remove("unselected");
                                    pane.element.classList.add(
                                        "fade-out-background"
                                    );
                                });
                                partialPath.unshift(selectedIndex);
                                this.focusedWidget?.focus();
                                resolve(partialPath);
                            } catch (e) {
                                if (
                                    e instanceof ViewSelectSpecificPaneError &&
                                    e.type ===
                                        SelectSpecificPathRejectionReason.Backward
                                ) {
                                    this.element.classList.add("indexed");
                                    document.addEventListener(
                                        "keydown",
                                        this.keydownListener!,
                                        { capture: true }
                                    );
                                    this.inSpecificSelection = true;
                                    this.panes.forEach((pane, i) => {
                                        pane.element.classList.toggle(
                                            "unselected",
                                            i !== selectedIndex
                                        );
                                    });
                                } else {
                                    this.panes.forEach((pane) => {
                                        pane.element.classList.remove(
                                            "unselected"
                                        );
                                        pane.element.classList.add(
                                            "fade-out-background"
                                        );
                                    });
                                    this.focusedWidget?.focus();
                                    reject(e);
                                }
                            }
                        }

                        setTimeout(() => {
                            this.panes.forEach((pane) => {
                                pane.element.classList.remove(
                                    "fade-out-background",
                                    "fade-out-index"
                                );
                            });
                        }, 100);
                    } else {
                        let newSelectedIndex: number = NaN;
                        switch (e.code) {
                            case "Tab":
                                if (e.shiftKey) {
                                    newSelectedIndex =
                                        selectedIndex === 0
                                            ? this.panes.length - 1
                                            : selectedIndex - 1;
                                } else {
                                    newSelectedIndex =
                                        (selectedIndex + 1) % this.panes.length;
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
                                        (this.panes.length -
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
                                                (this.panes.length -
                                                    this.colsSpan *
                                                        (this.rowsSpan - 1))) /
                                                (this.panes.length -
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
                            newSelectedIndex < this.panes.length
                        ) {
                            selectedIndex = newSelectedIndex;
                            this.panes.forEach((pane, i) => {
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

    private static generateComponent(): HTMLDivElement {
        const element = document.createElement("div");
        element.classList.add("view");

        return element;
    }
}
