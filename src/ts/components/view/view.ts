import { UUID } from "crypto";

import { PopupBuilder, PopupButton } from "@/components/interface/popup";
import Widget from "@/components/view/widgets/base";

import Pane from "./pane";

export default class View extends EventTarget {
    readonly id: UUID;
    readonly element: HTMLElement;

    private contentPane: Pane;
    private focusedWidget?: Widget;
    private widgets: Widget[] = [];
    private focusHistory: string[] = [];

    private closingAllRequested: boolean = false;
    private widgetClosingRequested: boolean = false;

    constructor(viewId: UUID) {
        super();

        this.id = viewId;

        [this.element, this.contentPane] = View.generateComponent();
    }

    private connectWidget(widget: Widget) {
        widget.addEventListener(
            "close",
            () => this.onWidgetClosing(widget.id),
            { once: true }
        );

        widget.element.addEventListener("focusin", () => {
            if (this.focusHistory[0] !== widget.id) {
                this.focusHistory.unshift(widget.id);
            }

            this.focusedWidget = widget;
            this.dispatchEvent(
                new CustomEvent("focusChange", { detail: widget.id })
            );
        });

        this.focusedWidget?.blur();
        this.focusedWidget = widget;

        widget.run();
    }

    async addWidget(widget: Widget) {
        this.widgets.push(widget);
        this.connectWidget(widget);

        if (this.widgets.length === 1) {
            this.contentPane.setWidget(widget);
        } else {
            this.contentPane.split(widget);
        }
    }

    private onWidgetClosing(widgetId: UUID) {
        const widget = this.widgets.find((widget) => widget.id === widgetId);
        if (widget) {
            widget.dispose();

            this.widgets.splice(this.widgets.indexOf(widget), 1);
            if (this.widgets.length === 0) {
                this.dispatchEvent(new Event("close"));
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
                this.dispatchEvent(
                    new CustomEvent("focusChange", {
                        detail: this.focusedWidget!.id,
                    })
                );
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
                        await popupManager.sendPopup(
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
                            await popupManager.sendPopup(
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
        this.connectWidget(widget);

        this.focusedWidget?.anchoringPane?.split(widget);
    }

    async splitSpecificWidget(widget: Widget, path: number[]) {
        this.widgets.push(widget);
        this.connectWidget(widget);

        this.contentPane.splitSpecific(widget, path);
    }

    async selectSpecificPane(): Promise<number[]> {
        if (this.widgets.length <= 1) {
            return [];
        }

        this.focusedWidget?.blur();
        try {
            return await this.contentPane.selectSpecific();
        } catch (e) {
            this.focusedWidget?.focus();
            throw e;
        }
    }

    private static generateComponent(): [HTMLDivElement, Pane] {
        const element = document.createElement("div");
        element.classList.add("view");

        const pane = new Pane(element);
        element.appendChild(pane.element);

        return [element, pane];
    }
}
