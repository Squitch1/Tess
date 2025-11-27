import { UUID } from "crypto";

import CircularProgressBar from "@/components/ux/progressBar";
import Widget from "@/components/view/widgets/base";

import defaultIcon from "@/icons/32x32/tess-alt.png";

export type WidgetData = {
    id: UUID;
    title: string;
    progress: number;
    needsAttention: boolean;
};
function defaultWidgetData(widgetId: UUID): WidgetData {
    return {
        id: widgetId,
        title: "",
        progress: 0,
        needsAttention: false,
    };
}

export class Tab extends EventTarget {
    readonly element: HTMLElement;
    readonly id: UUID;
    public index: number;

    readonly resizeObserver: ResizeObserver;

    #widgets: Map<UUID, WidgetData> = new Map();
    private activeWidget?: UUID;

    #title: string = "";

    private titleElement: HTMLSpanElement;
    private icon: TabIcon;

    constructor(index: number, tabId: UUID) {
        super();

        this.id = tabId;
        this.index = index;

        let closeButton;
        [this.element, this.titleElement, closeButton] =
            Tab.generateComponent();
        this.element.addEventListener("mouseover", () =>
            this.computeTitleClipping()
        );
        this.element.addEventListener("mouseleave", () =>
            this.computeTitleClipping()
        );
        closeButton.addEventListener("click", (e) => {
            e.preventDefault();
            this.dispatchEvent(new Event("closeRequest"));
        });

        this.icon = new TabIcon();
        this.element.appendChild(this.icon.element);

        this.refreshTitle();

        this.resizeObserver = new ResizeObserver(() =>
            this.computeTitleClipping()
        );
        this.resizeObserver.observe(this.element);
    }

    get title() {
        return this.#title;
    }

    get widgets() {
        return new Map(this.#widgets);
    }

    computeTitleClipping() {
        this.titleElement.classList.remove("extended", "clipped");

        if (this.titleElement.scrollWidth > this.titleElement.clientWidth) {
            this.titleElement.classList.toggle(
                "extended",
                this.titleElement.scrollWidth - this.titleElement.clientWidth <
                    20
            );
            this.titleElement.classList.toggle(
                "clipped",
                this.titleElement.scrollWidth > this.titleElement.clientWidth
            );
        }
    }

    addWidget(widgetId: UUID, state: typeof Widget.prototype.state) {
        const widget = defaultWidgetData(widgetId);
        widget.title = state.title;
        widget.progress = state.progress;
        this.#widgets.set(widgetId, widget);
        this.dispatchEvent(new CustomEvent("widgetAdded", { detail: widget }));
    }

    clearWidgetsAttention() {
        this.#widgets.forEach((widget) => {
            widget.needsAttention = false;
            this.dispatchEvent(
                new CustomEvent("widgetChange", { detail: widget })
            );
        });

        this.refreshAttentionStatus();
    }

    setWidgetState(widgetId: UUID, state: typeof Widget.prototype.state) {
        const widget =
            this.#widgets.get(widgetId) ?? defaultWidgetData(widgetId);
        widget.title = state.title;
        widget.progress = state.progress;
        this.refreshTitle();
        this.refreshProgress();

        this.dispatchEvent(new CustomEvent("widgetChange", { detail: widget }));
    }

    setWidgetAttention(widgetId: UUID, needsAttention: boolean) {
        const widget =
            this.#widgets.get(widgetId) ?? defaultWidgetData(widgetId);
        widget.needsAttention = needsAttention;

        this.refreshAttentionStatus();
        this.dispatchEvent(new CustomEvent("widgetChange", { detail: widget }));
    }

    setWidgetGroupLeader(widgetId: UUID) {
        if (this.#widgets.has(widgetId)) {
            this.activeWidget = widgetId;
        }

        this.refreshTitle();
    }

    removeWidget(widgetId: UUID) {
        if (this.#widgets.delete(widgetId)) {
            this.dispatchEvent(
                new CustomEvent("widgetRemoved", { detail: widgetId })
            );
        }
    }

    private refreshTitle() {
        const title =
            this.#widgets.get(this.activeWidget!)?.title || "Untitled tab";

        if (this.#title === title) {
            return;
        }

        this.#title = title;
        this.titleElement.innerText = title;
        this.titleElement.classList.toggle(
            "clipped",
            this.titleElement.scrollWidth > this.titleElement.clientWidth
        );
        this.dispatchEvent(new Event("titleChange"));
    }

    private refreshProgress() {
        let count = 0;
        let sum = 0;
        this.#widgets.forEach((widget) => {
            if (widget.progress > 0) {
                count++;
                sum += widget.progress;
            }
        });

        this.icon.setProgress(count > 0 ? sum / count : 0);
    }

    private refreshAttentionStatus() {
        this.icon.setAttention(
            Array.from(this.#widgets.values()).some(
                (widget) => widget.needsAttention
            )
        );
    }

    private static generateComponent(): [
        HTMLDivElement,
        HTMLSpanElement,
        HTMLDivElement,
    ] {
        const tab = document.createElement("div");
        tab.classList.add("tab");
        tab.style.animation = "tab-created 140ms forwards";

        const title = document.createElement("span");
        title.classList.add("title");

        const closeButton = document.createElement("div");
        closeButton.classList.add("close");
        closeButton.innerHTML = `
        <svg viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
        </svg>
        `;

        tab.append(title, closeButton);

        return [tab, title, closeButton];
    }
}

export class TabIcon {
    readonly element: HTMLDivElement;
    private progressBar: CircularProgressBar;

    constructor() {
        [this.element, this.progressBar] = TabIcon.generateComponent();
    }

    setProgress(progress: number) {
        if (progress > 0 && progress < 100) {
            this.progressBar.setProgress(progress);
        }
        this.element.classList.toggle(
            "show-progress",
            progress > 0 && progress < 100
        );
    }

    setAttention(enable: boolean) {
        this.element.classList.toggle("needs-attention", enable);
    }

    private static generateComponent(): [HTMLDivElement, CircularProgressBar] {
        const element = document.createElement("div");
        element.classList.add("tab-icon");

        const icon = document.createElement("img");
        icon.src = defaultIcon;

        const progressBar = new CircularProgressBar();

        element.append(progressBar.element, icon);

        return [element, progressBar];
    }
}
