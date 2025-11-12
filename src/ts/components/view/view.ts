import { UUID } from "crypto";

import { PopupBuilder, PopupButton } from "@/components/interface/popup";
import Widget from "@/components/view/widgets/base";

import PopupManager from "@/managers/popup";
import Toaster from "@/managers/toast";

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

    widgets: Widget[] = [];

    focusHistory: string[] = [];
    focusedWidget?: Widget;

    private closingAllRequested: boolean = false;
    private widgetClosingRequested: boolean = false;

    private contentPane: Pane;

    constructor(viewId: UUID, popupManager: PopupManager, toaster: Toaster) {
        this.id = viewId;

        this.element = View.generateComponent();

        this.onWidgetAdded = () => {};
        this.onWidgetFocused = () => {};
        this.onWidgetTitleUpdated = () => {};
        this.onWidgetRequestHighlight = () => {};
        this.onWidgetProgressUpdated = () => {};
        this.onWidgetClosed = () => {};

        this.contentPane = new Pane(
            crypto.randomUUID(),
            popupManager,
            this.element,
            () => {},
            (widgetId) => this.onWidgetClosing(widgetId)
        );
        this.element.appendChild(this.contentPane.element);

        this.onceClosed = () => {};

        this.popupManager = popupManager;
        this.toaster = toaster;
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

        widget.run();
    }

    async addWidget(widget: Widget) {
        if (this.widgets.length === 0) {
            this.contentPane.setWidget(widget);
        } else {
            this.contentPane.split(widget);
        }

        this.widgets.push(widget);
        this.onWidgetAdded(widget.id);
        this.linkWidget(widget);
        this.focusedWidget = widget;
    }

    private onWidgetClosing(widgetId: UUID) {
        const widget = this.widgets.find((widget) => widget.id === widgetId);
        if (widget) {
            widget.dispose();

            this.widgets.splice(this.widgets.indexOf(widget), 1);
            this.onWidgetClosed(widgetId);
            if (this.widgets.length === 0) {
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

    async close() {
        await Promise.all(this.widgets.map((widget) => widget.close()));
    }

    async closeWidget(widgetId: UUID) {
        await this.widgets.find((widget) => widget.id === widgetId)?.close();
    }

    cancelSelectSpecific() {
        if (this.contentPane.resumeSpecificSelection()) {
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
        return this.contentPane.closeSpecific(path);
    }

    focus() {
        this.element.classList.add("visible");
        if (!this.contentPane.resumeSpecificSelection()) {
            this.focusedWidget?.focus();
        }
    }

    focusWidget(widgetId: UUID) {
        this.widgets.find((widget) => widget.id === widgetId)?.focus();
    }

    blur() {
        this.element.classList.remove("visible");
        this.focusedWidget?.blur();
        this.contentPane.pauseSpecificSelection();
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
        this.contentPane.splitSpecific(widget, path);

        this.linkWidget(widget);
        this.widgets.push(widget);
        this.focusedWidget = widget;
        this.onWidgetAdded(widget.id);
    }

    selectSpecificPane(): Promise<number[]> {
        if (this.widgets.length <= 1) {
            return Promise.resolve([]);
        }

        this.focusedWidget?.blur();
        return this.contentPane.selectSpecific();
    }

    private static generateComponent(): HTMLDivElement {
        const element = document.createElement("div");
        element.classList.add("view");

        return element;
    }
}
