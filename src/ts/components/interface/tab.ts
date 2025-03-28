import tabIcon from "icons/default-tab.png";

export default class Tab {
    element: HTMLElement;

    uuid: string;
    index: number;

    onClose: ((uuid: string) => void) | null = null;

    title: string = "";

    panes: Map<
        string,
        {
            title: string;
            progress: number;
        }
    > = new Map();

    paneGroupLeader: string = "";

    onCloseButtonClick?: () => void;
    onClick?: (e: MouseEvent) => void;

    onTitleUpdated: (title: string) => void;

    resizeObserver: ResizeObserver;

    private titleElement: HTMLSpanElement;
    private progressBarElement: HTMLElement;
    private progressBarValueElement: HTMLElement;

    constructor(index: number, uuid: string, onClose: (uuid: string) => void) {
        this.uuid = uuid;
        this.index = index;
        this.element = this.generateComponent();

        this.titleElement = this.element.querySelector(".title")!;
        this.progressBarElement = this.element.querySelector(".progress")!;
        this.progressBarValueElement = this.element.querySelector(".value")!;

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
        this.titleElement.classList.remove("extanded", "clipped");

        if (this.titleElement.scrollWidth > this.titleElement.clientWidth) {
            this.titleElement.classList.toggle(
                "extanded",
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
        this.panes.set(paneId, {
            title: "",
            progress: 0,
        });
    }

    setPaneTitle(paneId: string, title: string) {
        const pane = this.panes.get(paneId) || {
            title: "",
            progress: 0,
        };
        pane.title = title;
        this.panes.set(paneId, pane);

        this.updateTitle();
    }

    setPaneProgress(paneId: string, progress: number) {
        const pane = this.panes.get(paneId) || {
            title: "",
            progress: 0,
        };
        pane.progress = progress;
        this.panes.set(paneId, pane);

        this.updateProgress();
    }

    setPaneGroupLeader(paneId: string) {
        if (this.panes.has(paneId)) {
            this.paneGroupLeader = paneId;
        }

        this.updateTitle();
    }

    removePane(paneId: string) {
        this.panes.delete(paneId);
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
        let progressSum = 0;
        let progressCount = 0;
        this.panes.forEach((pane) => {
            if (pane.progress > 0) {
                progressCount++;
                progressSum += pane.progress;
            }
        });
        const value = progressSum / progressCount;

        if (value > 0 && value < 100) {
            if (!this.progressBarElement.hasAttribute("progress")) {
                this.progressBarElement.setAttribute("progress", "");
                this.progressBarElement.style.animation = "";
                // eslint-disable-next-line no-unused-expressions
                this.progressBarElement.offsetTop;
                this.progressBarElement.style.animation =
                    "tab-progress-bar-progress-added 140ms forwards";

                this.progressBarElement.style.animationDelay = "35ms";
                this.titleElement.style.animation = "";
                // eslint-disable-next-line no-unused-expressions
                this.titleElement.offsetTop;
                this.titleElement.style.animation =
                    "tab-title-progress-added 140ms forwards";
            }

            this.progressBarValueElement.style.width = `${value}%`;
        } else if (this.progressBarElement.hasAttribute("progress")) {
            this.progressBarElement.removeAttribute("progress");
            setTimeout(() => {
                this.titleElement.style.animation = "";
                // eslint-disable-next-line no-unused-expressions
                this.titleElement.offsetTop;
                this.titleElement.style.animation =
                    "tab-title-progress-added 140ms forwards reverse";
            }, 35);
            this.progressBarElement.style.animation = "";
            // eslint-disable-next-line no-unused-expressions
            this.progressBarElement.offsetTop;
            this.progressBarElement.style.animationDelay = "0ms";
            this.progressBarElement.style.animation =
                "tab-progress-bar-progress-added 140ms forwards reverse";
        }
    }

    setHighlight(visible: boolean) {
        this.element
            .querySelector(".ping")!
            .classList.toggle("hidden", !visible);
    }

    private generateComponent(): HTMLElement {
        const tab = document.createElement("div");

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

        const icon = document.createElement("div");
        const iconImage = document.createElement("img");
        iconImage.src = tabIcon;
        icon.classList.add("icon");
        icon.appendChild(iconImage);

        const progress = document.createElement("div");
        const progressValue = document.createElement("div");
        progressValue.classList.add("value");
        progress.classList.add("progress");
        progress.appendChild(progressValue);

        const pingMark = document.createElement("div");
        pingMark.classList.add("ping", "hidden");

        tab.append(icon, title, closeButton, progress, pingMark);

        return tab;
    }
}
