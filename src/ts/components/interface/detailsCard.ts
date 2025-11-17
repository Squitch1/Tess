import { UUID } from "crypto";

import Slider from "@/components/interface/slider";
import { Tab, TabIcon, WidgetData } from "@/components/interface/tab";

import clamp from "@/utils/clamp";

type DetailsCardEntriesPage = {
    element: HTMLDivElement;
    entries: DetailsCardEntry[];
};

enum Direction {
    left = "-1",
    right = "1",
}
function reverseDirection(dir?: Direction) {
    switch (dir) {
        case Direction.left:
            return Direction.right;
        case Direction.right:
            return Direction.left;
        default:
            return dir;
    }
}

export default class DetailsCard extends EventTarget {
    readonly element: HTMLDivElement;
    private pagesContainer: HTMLDivElement;

    private tab?: Tab;
    private pages: DetailsCardEntriesPage[] = [];
    private currentPage?: DetailsCardEntriesPage;
    private slider: Slider;

    private pageFaddingTimeout?: ReturnType<typeof setTimeout>;
    private transitioning: boolean = false;
    private slidingPageIndexOffset: number = 0;

    private onWidgetAdded: (e: CustomEventInit) => void;
    private onWidgetChange: (e: CustomEventInit) => void;
    private onWidgetRemoved: (e: CustomEventInit) => void;

    constructor() {
        super();

        [this.element, this.pagesContainer, this.slider] =
            DetailsCard.generateComponent();

        this.slider.addEventListener(
            "pageChangeRequest",
            (e: CustomEventInit) => {
                this.setCurrentPage(e.detail);
            }
        );

        this.pagesContainer.addEventListener("wheel", (e) =>
            this.setCurrentPage(
                this.pages.indexOf(this.currentPage!) + (e.deltaY > 0 ? 1 : -1)
            )
        );

        this.onWidgetAdded = (e) => {
            this.createEntry(e.detail);
        };
        this.onWidgetChange = (e) => {
            this.changeEntry(e.detail);
        };
        this.onWidgetRemoved = (e) => {
            this.removeEntry(e.detail);
        };
    }

    get visible() {
        return this.tab !== undefined;
    }

    showForTab(tab: Tab) {
        if (this.tab?.id === tab.id) {
            return;
        }

        if (!this.tab) {
            this.pages = [];
            this.pagesContainer.innerHTML = "";
            this.pagesContainer.style.height = "";
        }

        const clientRect = tab.element.getBoundingClientRect();
        const tabPosition = (clientRect.right + clientRect.left) / 2;
        const cardPosition = clamp(
            12,
            tabPosition - 240 / 2,
            document.body.clientWidth - 240 - 12
        );
        this.element.style.translate = `${cardPosition}px`;

        this.pages.forEach((page) => {
            if (page !== this.currentPage) {
                this.pagesContainer.removeChild(page.element);
            }
        });

        const chunkSize = 5;
        this.pages = Array.from(tab.widgets.values())
            .reduce<WidgetData[][]>((chunks, _, i, arr) => {
                if (i % chunkSize === 0) {
                    chunks.push(arr.slice(i, i + chunkSize));
                }
                return chunks;
            }, [])
            .map((arr) => {
                const element = DetailsCard.newPageElement();
                return {
                    element,
                    entries: arr.map((data) => {
                        const entry = this.setupEntry(data);
                        element.appendChild(entry.element);
                        return entry;
                    }),
                };
            });
        this.slider.setPageCount(this.pages.length, 0);
        this.pagesContainer.append(...this.pages.map((page) => page.element));

        if (this.tab) {
            this.setCurrentPage(
                0,
                this.tab.index < tab.index ? Direction.left : Direction.right,
                (page) => {
                    this.pagesContainer.removeChild(page.element);
                }
            );
        } else {
            this.pages[0].element.style.display = "";
            this.pages[0].element.classList.add("visible");
            this.currentPage = this.pages.at(0);
            document.body.appendChild(this.element);
            this.pagesContainer.style.height = `${this.currentPage?.element.clientHeight}px`;
        }

        this.tab?.removeEventListener("widgetAdded", this.onWidgetAdded);
        this.tab?.removeEventListener("widgetChange", this.onWidgetChange);
        this.tab?.removeEventListener("widgetRemoved", this.onWidgetRemoved);
        this.tab = tab;
        this.tab.addEventListener("widgetAdded", this.onWidgetAdded);
        this.tab.addEventListener("widgetChange", this.onWidgetChange);
        this.tab.addEventListener("widgetRemoved", this.onWidgetRemoved);
    }

    hide() {
        if (this.tab) {
            this.tab.removeEventListener("widgetAdded", this.onWidgetAdded);
            this.tab.removeEventListener("widgetChange", this.onWidgetChange);
            this.tab.removeEventListener("widgetRemoved", this.onWidgetRemoved);
            this.tab = undefined;
            this.element.remove();
        }
    }

    private setupEntry(data: WidgetData): DetailsCardEntry {
        const entry = new DetailsCardEntry(data);
        entry.addEventListener("closeRequest", (e: CustomEventInit) => {
            this.dispatchEvent(
                new CustomEvent("widgetCloseRequest", {
                    detail: { tabId: this.tab!.id, widgetId: e.detail },
                })
            );
        });
        entry.addEventListener("focusRequest", (e: CustomEventInit) => {
            this.dispatchEvent(
                new CustomEvent("widgetFocusRequest", {
                    detail: { tabId: this.tab!.id, widgetId: e.detail },
                })
            );
        });

        return entry;
    }

    private createEntry(data: WidgetData) {
        const entry = this.setupEntry(data);

        if (this.pages[this.pages.length - 1].entries.length < 5) {
            this.pages[this.pages.length - 1].entries.push(entry);
            this.pages[this.pages.length - 1].element.appendChild(
                entry.element
            );
            if (
                this.pages.indexOf(this.currentPage!) ===
                this.pages.length - 1
            ) {
                entry.element.animate(
                    {
                        translate: ["-40px", "0"],
                        opacity: [0, 1],
                    },
                    {
                        delay: 25,
                        duration: 140,
                        easing: "ease-in-out",
                        fill: "backwards",
                    }
                );
            }
        } else {
            const page = {
                element: DetailsCard.newPageElement(),
                entries: [entry],
            };
            page.element.appendChild(entry.element);
            this.pages.push(page);

            this.pagesContainer.appendChild(page.element);

            this.slider.setPageCount(20, 20);
            this.slider.setPageCount(
                this.pages.length,
                this.pages.indexOf(this.currentPage!)
            );
        }

        this.pagesContainer.style.height = `${
            this.currentPage!.element.clientHeight
        }px`;
    }

    private changeEntry(data: WidgetData) {
        for (const page of this.pages) {
            const entry = page.entries.find(
                (entry) => entry.widgetId === data.id
            );
            if (entry) {
                entry.setData(data);
                break;
            }
        }
    }

    private removeEntry(data: WidgetData) {
        for (const page of this.pages) {
            const entry = page.entries.find(
                (entry) => entry.widgetId === data.id
            );
            if (entry) {
                entry.markAsClosed();
                break;
            }
        }
    }

    private setCurrentPage(
        pageIndex: number,
        dir?: Direction,
        callback?: (group: DetailsCardEntriesPage) => void
    ) {
        if (pageIndex < 0 || pageIndex >= this.pages.length) {
            return;
        }

        this.slidingPageIndexOffset =
            pageIndex - this.pages.indexOf(this.currentPage!);

        if (this.transitioning) {
            return;
        }

        clearTimeout(this.pageFaddingTimeout);
        this.transitioning = true;
        const currentPage = this.currentPage!;

        this.pagesContainer.style.height = `${currentPage.element.clientHeight}px`;
        currentPage.element.style.setProperty(
            "--direction",
            dir ?? (this.slidingPageIndexOffset > 0 ? "-1" : "1")
        );
        currentPage.element.classList.remove("visible");

        const onceTransitionStart = () => {
            clearTimeout(this.pageFaddingTimeout);
            this.pageFaddingTimeout = setTimeout(oncePageFaddedOut, 140);
        };

        const oncePageFaddedOut = () => {
            const currentPageIndex = this.pages.indexOf(this.currentPage!);

            currentPage.element.removeEventListener(
                "transitionstart",
                onceTransitionStart
            );

            const destinationPage =
                this.pages[currentPageIndex + this.slidingPageIndexOffset];
            destinationPage.element.style.setProperty(
                "--direction",
                reverseDirection(dir) ??
                    (this.slidingPageIndexOffset > 0 ? "1" : "-1")
            );
            destinationPage.element.style.display = "";

            currentPage.element.style.display = "none";
            this.pagesContainer.style.height = `${destinationPage.element.clientHeight}px`;
            destinationPage.element.classList.add("visible");

            this.currentPage = destinationPage;
            this.transitioning = false;
            this.slider.setCurrentPage(
                currentPageIndex + this.slidingPageIndexOffset
            );
            if (callback) {
                callback(currentPage);
            }
        };

        this.pageFaddingTimeout = setTimeout(oncePageFaddedOut, 140);
        currentPage.element.addEventListener(
            "transitionstart",
            onceTransitionStart
        );
    }

    private static generateComponent(): [
        HTMLDivElement,
        HTMLDivElement,
        Slider,
    ] {
        const cardWrapper = document.createElement("div");
        cardWrapper.id = "details-card";

        const card = document.createElement("div");

        const slider = new Slider();

        const pagesContainer = document.createElement("div");
        pagesContainer.classList.add("pages");

        card.append(slider.element, pagesContainer);
        cardWrapper.appendChild(card);

        return [cardWrapper, pagesContainer, slider];
    }

    private static newPageElement(): HTMLDivElement {
        const element = document.createElement("div");
        element.style.display = "none";
        return element;
    }
}

class DetailsCardEntry extends EventTarget {
    readonly element: HTMLDivElement;

    private id: UUID;
    private icon: TabIcon;
    private title: HTMLSpanElement;

    constructor(data: WidgetData) {
        super();
        let closeButton;
        [this.element, this.icon, this.title, closeButton] =
            DetailsCardEntry.generateComponent();
        this.id = data.id;

        this.element.addEventListener("click", () => {
            this.dispatchEvent(
                new CustomEvent("focusRequest", { detail: this.id })
            );
        });
        closeButton.addEventListener("click", (e) => {
            e.stopImmediatePropagation();
            this.dispatchEvent(
                new CustomEvent("closeRequest", { detail: this.id })
            );
        });

        this.setData(data);
    }

    get widgetId() {
        return this.id;
    }

    setData(data: WidgetData) {
        this.title.innerText = data.title;
        this.icon.setProgress(data.progress);
        this.icon.setAttention(data.needsAttention);
    }

    markAsClosed() {
        this.element.classList.add("closed");
    }

    private static generateComponent(): [
        HTMLDivElement,
        TabIcon,
        HTMLSpanElement,
        HTMLDivElement,
    ] {
        const element = document.createElement("div");

        const icon = new TabIcon();

        const title = document.createElement("span");
        title.classList.add("title");

        const closeButton = document.createElement("div");
        closeButton.classList.add("close");
        closeButton.innerHTML = `
        <svg viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
        </svg>
        `;

        element.append(icon.element, title, closeButton);
        return [element, icon, title, closeButton];
    }
}
