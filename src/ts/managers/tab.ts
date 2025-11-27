import { UUID } from "crypto";

import DetailsCard from "@/components/interface/detailsCard";
import { Tab } from "@/components/interface/tab";
import Widget from "@/components/view/widgets/base";

import clamp from "@/utils/clamp";

export default class TabManager extends EventTarget {
    private target: Element;
    private tabs: Tab[] = [];
    private selectedTab?: Tab;

    private movingTab?: Tab;
    private nextTab?: Tab;
    private prevTab?: Tab;
    private initialMousePosition: number = 0;
    private initialOffsetLeft: number = 0;
    private movingTabDeltaIndex: number = 0;
    private tabsMovedLeft: Tab[] = [];
    private tabsMovedRight: Tab[] = [];

    private detailsCard: DetailsCard;
    private showDetailsCardTimeout?: ReturnType<typeof setTimeout>;

    constructor(target: HTMLElement) {
        super();

        this.target = target;
        this.detailsCard = new DetailsCard();

        this.detailsCard.addEventListener(
            "widgetFocusRequest",
            (e: CustomEventInit) => {
                this.select(e.detail.tabId);
                this.dispatchEvent(
                    new CustomEvent("widgetFocusRequest", {
                        detail: e.detail,
                    })
                );
            }
        );
        this.detailsCard.addEventListener(
            "widgetCloseRequest",
            (e: CustomEventInit) =>
                this.dispatchEvent(
                    new CustomEvent("widgetCloseRequest", { detail: e.detail })
                )
        );

        let draggingAnimationFrame: number;
        let animationLocked: boolean = false;
        document.addEventListener("mouseout", (e) => {
            if (e.relatedTarget === null) {
                this.hideDetailsCard();
            }
        });
        document.addEventListener("mousemove", (e) => {
            const deltaX = e.clientX - this.initialMousePosition;
            if (
                !this.movingTab ||
                (!this.movingTab.element.classList.contains("dragging") &&
                    deltaX * deltaX < 12 * 12)
            ) {
                return;
            }

            if (!animationLocked) {
                animationLocked = true;
                draggingAnimationFrame = requestAnimationFrame(() => {
                    this.inDragging(this.movingTab!, deltaX);
                    animationLocked = false;
                });
            }
        });
        document.addEventListener("mouseup", () => {
            if (draggingAnimationFrame) {
                animationLocked = false;
                cancelAnimationFrame(draggingAnimationFrame);
            }
            if (!this.movingTab) {
                return;
            }

            this.stopDragging(this.movingTab);
        });

        this.detailsCard.element.addEventListener("mouseleave", (e) => {
            if (
                !this.tabs.find((tab) =>
                    tab.element.contains(e.relatedTarget as Node)
                )
            ) {
                this.hideDetailsCard();
            }
        });
    }

    openTab(tabId: UUID): string {
        const tab = new Tab(this.tabs.length + 1, tabId);

        tab.addEventListener("closeRequest", () => {
            if (this.selectedTab !== tab) {
                this.dispatchEvent(
                    new CustomEvent("tabFocus", {
                        detail: this.selectedTab!.id,
                    })
                );
            }
            this.dispatchEvent(
                new CustomEvent("tabCloseRequest", { detail: tabId })
            );
        });
        tab.addEventListener("titleChange", () => {
            if (this.selectedTab === tab) {
                this.dispatchEvent(
                    new CustomEvent("tabTitleChange", { detail: tab.title })
                );
            }
        });

        tab.element.addEventListener("mousedown", (e) => {
            clearTimeout(this.showDetailsCardTimeout);
            this.focusAndStartDragging(e, tab);
        });
        tab.element.addEventListener("mouseenter", () =>
            this.showDetailsCard(tab)
        );
        tab.element.addEventListener("mouseleave", (e) => {
            const destinationElement = e.relatedTarget as HTMLElement | null;
            if (
                destinationElement &&
                !this.tabs.find((tab) =>
                    tab.element.contains(destinationElement)
                ) &&
                destinationElement.id !== "details-card" &&
                !this.detailsCard.element.contains(destinationElement)
            ) {
                this.hideDetailsCard();
            }
        });

        tab.element.style.order = `${this.tabs.length + 1}`;
        this.tabs.push(tab);
        this.target.appendChild(tab.element);

        if (this.tabs.length === 0) {
            tab.element.classList.add("selected");
            this.select(tab.id);
        }

        return tab.id;
    }

    setWidgetState(
        tabId: UUID,
        widgetId: UUID,
        state: typeof Widget.prototype.state
    ) {
        this.tabs
            .find((tab) => tab.id === tabId)
            ?.setWidgetState(widgetId, state);
    }

    setWidgetAttention(tabId: UUID, widgetId: UUID, needsAttention: boolean) {
        if (this.selectedTab?.id === tabId) {
            return;
        }

        this.tabs
            .find((tab) => tab.id === tabId)
            ?.setWidgetAttention(widgetId, needsAttention);
    }

    setWidgetGroupLeader(tabId: UUID, widgetId: UUID) {
        this.tabs
            .find((tab) => tab.id === tabId)
            ?.setWidgetGroupLeader(widgetId);
    }

    addWidget(
        tabId: UUID,
        widgetId: UUID,
        state: typeof Widget.prototype.state
    ) {
        this.tabs.find((tab) => tab.id === tabId)?.addWidget(widgetId, state);

        if (this.selectedTab?.id === tabId) {
            setTimeout(
                () =>
                    this.dispatchEvent(
                        new CustomEvent("tabFocus", { detail: tabId })
                    ),
                0
            );
        }
    }

    removeWidget(tabId: UUID, widgetId: UUID) {
        this.tabs.find((tab) => tab.id === tabId)?.removeWidget(widgetId);

        if (this.selectedTab?.id === tabId) {
            setTimeout(
                () =>
                    this.dispatchEvent(
                        new CustomEvent("tabFocus", { detail: tabId })
                    ),
                0
            );
        }
    }

    closeTab(tabId: UUID) {
        const tab = this.tabs.find((tab) => tab.id === tabId);
        if (tab) {
            this.hideDetailsCard();
            this.tabs.splice(this.tabs.indexOf(tab), 1);
            tab.element.style.animation = "tab-removed 140ms forwards";
            tab.resizeObserver.disconnect();
            const closingTabIndex = tab.index;
            this.tabs.forEach((tab) => {
                if (tab.index > closingTabIndex) {
                    tab.index -= 1;
                    tab.element.style.order = `${tab.index}`;
                }
            });
            setTimeout(() => tab.element.remove(), 140);

            if (this.selectedTab!.id === tabId) {
                this.select(
                    clamp(0, this.selectedTab!.index, this.tabs.length)
                );
            }
        }
    }

    selectNext() {
        this.select((this.selectedTab!.index % this.tabs.length) + 1);
    }

    selectPrevious() {
        this.select(
            this.selectedTab!.index - 1 < 1
                ? this.tabs.length
                : this.selectedTab!.index - 1
        );
    }

    selectFirst() {
        this.select(1);
    }

    selectLast() {
        this.select(this.tabs.length);
    }

    select(tabId: UUID): void;
    select(index: number): void;
    select(selector: UUID | number) {
        const tab = this.tabs.find(
            (tab) => tab.id === selector || tab.index === selector
        );

        if (tab && tab !== this.selectedTab) {
            this.selectedTab?.element.classList.remove("selected");
            this.selectedTab = tab;
            this.selectedTab.clearWidgetsAttention();
            tab.element.classList.add("selected");

            this.dispatchEvent(new CustomEvent("tabFocus", { detail: tab.id }));
            this.dispatchEvent(
                new CustomEvent("tabTitle", { detail: tab.title })
            );
        }
    }

    private focusAndStartDragging(e: MouseEvent, tab: Tab) {
        if (
            (e.target as HTMLElement).classList.contains("close") ||
            this.tabs.length === 1
        ) {
            const element = document.activeElement as HTMLElement | null;
            requestAnimationFrame(() => element?.focus());
            return;
        }

        e.preventDefault();
        this.select(tab.id);

        tab.element.style.animation = "";

        this.movingTab = tab;
        this.initialMousePosition = e.clientX;
        this.initialOffsetLeft = tab.element.offsetLeft;
        this.nextTab = this.tabs.find((item) => item.index === tab.index + 1);
        this.prevTab = this.tabs.find((item) => item.index === tab.index - 1);
    }

    private inDragging(tab: Tab, deltaX: number) {
        tab.element.classList.add("dragging");

        if (
            this.initialOffsetLeft + deltaX > 0 &&
            deltaX + tab.element.clientWidth + this.initialOffsetLeft <
                this.target.clientWidth
        ) {
            tab.element.style.transform = `translateX(${deltaX}px)`;
        } else if (this.initialOffsetLeft + deltaX < 0) {
            tab.element.style.transform = `translateX(${-this
                .initialOffsetLeft}px)`;
        } else if (
            deltaX + tab.element.clientWidth + this.initialOffsetLeft >
            this.target.clientWidth
        ) {
            tab.element.style.transform = `translateX(${
                this.target.clientWidth -
                tab.element.clientWidth -
                this.initialOffsetLeft
            }px)`;
        }

        const deltaIndex = Math.round(deltaX / tab.element.clientWidth);
        while (deltaIndex !== this.movingTabDeltaIndex) {
            let slidingTab;
            let slidingTabTranslation;
            if (deltaIndex > this.movingTabDeltaIndex) {
                if (this.tabsMovedRight.length > 0) {
                    slidingTab = this.tabsMovedRight.pop()!;
                    slidingTabTranslation = "0";
                } else if (this.nextTab) {
                    slidingTab = this.nextTab;
                    slidingTabTranslation = "-100%";

                    this.tabsMovedLeft.push(slidingTab);
                } else {
                    break;
                }

                this.movingTabDeltaIndex += 1;
                tab.index += 1;
                slidingTab.index -= 1;
                this.prevTab = slidingTab;
                this.nextTab = this.tabs.find(
                    (tab) => tab.index === slidingTab!.index + 2
                );
            } else {
                if (this.tabsMovedLeft.length > 0) {
                    slidingTab = this.tabsMovedLeft.pop()!;
                    slidingTabTranslation = "0";
                } else if (this.prevTab) {
                    slidingTab = this.prevTab;
                    slidingTabTranslation = "100%";

                    this.tabsMovedRight.push(this.prevTab);
                } else {
                    break;
                }

                this.movingTabDeltaIndex -= 1;
                tab.index -= 1;
                slidingTab.index += 1;
                this.nextTab = slidingTab;
                this.prevTab = this.tabs.find(
                    (tab) => tab.index === slidingTab!.index - 2
                );
            }

            slidingTab.element.classList.add("moved");
            slidingTab.element.style.transform = `translateX(${slidingTabTranslation})`;
        }
    }

    private stopDragging(tab: Tab) {
        const deltaX = new WebKitCSSMatrix(
            window.getComputedStyle(tab.element).transform
        ).m41;

        this.tabsMovedLeft.forEach((tab) => {
            const index = Number(tab.element.style.order) - 1;
            tab.element.style.order = `${index}`;
            tab.index = index;
        });
        this.tabsMovedRight.forEach((tab) => {
            const index = Number(tab.element.style.order) + 1;
            tab.element.style.order = `${index}`;
            tab.index = index;
        });
        this.tabs.forEach((tab) => {
            tab.element.classList.remove("moved");
            tab.element.style.transform = "";
        });

        tab.element.addEventListener(
            "animationend",
            (e) => {
                const element = e.target as HTMLElement;
                element.classList.remove("dragging");
                element.style.transform = "";
                element.style.animation = "";
            },
            { once: true }
        );
        tab.element.style.order = `${tab.index}`;
        tab.element.style.animation =
            "tab-slide-to-center 140ms ease-in-out forwards";
        tab.element.style.transform = `translateX(${
            deltaX - this.movingTabDeltaIndex * tab.element.clientWidth
        }px)`;

        this.movingTab = undefined;
        this.prevTab = undefined;
        this.nextTab = undefined;
        this.tabsMovedLeft = [];
        this.tabsMovedRight = [];
        this.movingTabDeltaIndex = 0;
    }

    private showDetailsCard(tab: Tab) {
        clearTimeout(this.showDetailsCardTimeout);
        this.showDetailsCardTimeout = setTimeout(
            () => this.detailsCard.showForTab(tab),
            this.detailsCard.visible ? 0 : settings.appBehavior.detailsCardDelay
        );
    }

    private hideDetailsCard() {
        clearTimeout(this.showDetailsCardTimeout);
        this.detailsCard.hide();
    }
}
