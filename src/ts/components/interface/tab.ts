import CircularProgressBar from "components/ux/progressBar";
import defaultIcon from "icons/32x32/tess-alt.png";

export type PaneData = {
    id: string;
    title: string;
    progress: number;
    needsAttention: boolean;
};
function defaultPaneData(id: string): PaneData {
    return {
        id,
        title: "",
        progress: 0,
        needsAttention: false,
    };
}

export class Tab extends EventTarget {
    element: HTMLElement;

    uuid: string;
    index: number;

    onClose: ((uuid: string) => void) | null = null;

    title: string = "";

    panes: Map<string, PaneData> = new Map();

    paneGroupLeader: string = "";

    onCloseButtonClick?: () => void;
    onClick?: (e: MouseEvent) => void;

    onTitleUpdated: (title: string) => void;

    resizeObserver: ResizeObserver;

    private titleElement: HTMLSpanElement;
    private icon: TabIcon;

    constructor(index: number, uuid: string, onClose: (uuid: string) => void) {
        super();

        this.uuid = uuid;
        this.index = index;
        this.element = this.generateComponent();

        this.titleElement = this.element.querySelector(".title")!;
        this.icon = new TabIcon();
        this.element.appendChild(this.icon.element);

        this.onTitleUpdated = () => {};

        this.updateTitle();

        this.onClose = onClose;

        this.resizeObserver = new ResizeObserver(() => {
            this.computeTitleClipping();
        });
        this.resizeObserver.observe(this.element);

        this.element.addEventListener("mouseover", () =>
            this.computeTitleClipping()
        );
        this.element.addEventListener("mouseleave", () =>
            this.computeTitleClipping()
        );
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

    addPane(paneId: string) {
        const pane = defaultPaneData(paneId);
        this.panes.set(paneId, pane);
        this.dispatchEvent(new CustomEvent("paneAdded", { detail: pane }));
    }

    clearPanesAttention() {
        this.panes.forEach((pane) => {
            pane.needsAttention = false;
            this.dispatchEvent(
                new CustomEvent("paneUpdated", { detail: pane })
            );
        });

        this.updateAttentionStatus();
    }

    setPaneTitle(paneId: string, title: string) {
        const pane = this.panes.get(paneId) || defaultPaneData(paneId);
        pane.title = title;
        this.panes.set(paneId, pane);

        this.updateTitle();
        this.dispatchEvent(new CustomEvent("paneUpdated", { detail: pane }));
    }

    setPaneProgress(paneId: string, progress: number) {
        const pane = this.panes.get(paneId) || defaultPaneData(paneId);
        pane.progress = progress;
        this.panes.set(paneId, pane);

        this.updateProgress();
        this.dispatchEvent(new CustomEvent("paneUpdated", { detail: pane }));
    }

    setPaneAttention(paneId: string, needsAttention: boolean) {
        const pane = this.panes.get(paneId) || defaultPaneData(paneId);
        pane.needsAttention = needsAttention;
        this.panes.set(paneId, pane);

        this.updateAttentionStatus();
        this.dispatchEvent(new CustomEvent("paneUpdated", { detail: pane }));
    }

    setPaneGroupLeader(paneId: string) {
        if (this.panes.has(paneId)) {
            this.paneGroupLeader = paneId;
        }

        this.updateTitle();
    }

    removePane(paneId: string) {
        const pane = this.panes.get(paneId);
        if (pane) {
            this.panes.delete(paneId);
            this.dispatchEvent(
                new CustomEvent("paneRemoved", { detail: pane })
            );
        }
    }

    updateTitle() {
        const title =
            this.panes.get(this.paneGroupLeader)?.title || "Untitled tab";

        if (this.title !== title) {
            this.onTitleUpdated(title);
        }

        this.title = title;
        this.titleElement.innerText = title;
        this.titleElement.classList.toggle(
            "clipped",
            this.titleElement.scrollWidth > this.titleElement.clientWidth
        );
    }

    updateProgress() {
        let count = 0;
        let sum = 0;
        this.panes.forEach((pane) => {
            if (pane.progress > 0) {
                count++;
                sum += pane.progress;
            }
        });

        this.icon.setProgress(count > 0 ? sum / count : 0);
    }

    private updateAttentionStatus() {
        this.icon.setAttention(
            Array.from(this.panes.values()).some(
                (pane: PaneData) => pane.needsAttention
            )
        );
    }

    private generateComponent(): HTMLElement {
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
        closeButton.addEventListener(
            "click",
            (this.onCloseButtonClick = () => {
                this.onClose!(this.uuid);
            })
        );

        tab.append(title, closeButton);

        return tab;
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
