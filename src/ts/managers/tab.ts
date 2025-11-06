import { UUID } from "crypto";

import DetailsCard from "@/components/interface/detailsCard";
import { Tab } from "@/components/interface/tab";

import clamp from "@/utils/clamp";

export default class TabManager {
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

    onTabFocused: (tabId: UUID) => void;
    onFocusedTabTitleUpdated: (title: string) => void;
    onPaneFocused: (tabId: UUID, paneId: UUID) => void;
    onPaneClosed: (tabId: UUID, paneId: UUID) => void;
    private onTabRequestClose: (tabId: UUID) => void;

    constructor(
        target: HTMLElement,
        closeRequestedListener: (tabId: UUID) => void
    ) {
        this.target = target;
        this.onTabRequestClose = closeRequestedListener;
        this.detailsCard = new DetailsCard();

        this.detailsCard.addEventListener(
            "paneFocusRequest",
            (e: CustomEventInit) => {
                this.select(e.detail.tabId);
                this.onPaneFocused(e.detail.tabId, e.detail.paneId);
            }
        );
        this.detailsCard.addEventListener(
            "paneCloseRequest",
            (e: CustomEventInit) => {
                this.onPaneClosed(e.detail.tabId, e.detail.paneId);
            }
        );

        this.onTabFocused = () => {};
        this.onPaneFocused = () => {};
        this.onPaneClosed = () => {};
        this.onFocusedTabTitleUpdated = () => {};

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
        const tab = new Tab(this.tabs.length + 1, tabId, (tabId) => {
            if (this.selectedTab !== tab) {
                this.onTabFocused(this.selectedTab!.id);
                this.onFocusedTabTitleUpdated(this.selectedTab!.title);
            }
            this.requestTabClosing(tabId);
        });

        tab.onTitleUpdated = (title) => {
            if (this.selectedTab?.id === tab.id) {
                this.onFocusedTabTitleUpdated(title);
            }
        };

        tab.element.addEventListener(
            "mousedown",
            (tab.onClick = (e) => {
                clearTimeout(this.showDetailsCardTimeout);
                this.focusAndStartDragging(e, tab);
            })
        );
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

    setPaneTitle(tabId: UUID, paneId: UUID, title: string) {
        this.tabs.find((tab) => tab.id === tabId)?.setPaneTitle(paneId, title);
    }

    setPaneProgress(tabId: UUID, paneId: UUID, progress: number) {
        this.tabs
            .find((tab) => tab.id === tabId)
            ?.setPaneProgress(
                paneId,
                progress > 0 && progress < 100 ? progress : 0
            );
    }

    setPaneAttention(tabId: UUID, paneId: UUID, needsAttention: boolean) {
        if (tabId === this.selectedTab!.id) {
            return;
        }

        this.tabs
            .find((tab) => tab.id === tabId)
            ?.setPaneAttention(paneId, needsAttention);
    }

    setPaneGroupLeader(tabId: UUID, paneId: UUID) {
        this.tabs.find((tab) => tab.id === tabId)?.setPaneGroupLeader(paneId);
    }

    addPane(tabId: UUID, paneId: UUID) {
        this.tabs.find((tab) => tab.id === tabId)?.addPane(paneId);

        if (this.selectedTab?.id === tabId) {
            setTimeout(() => this.onTabFocused(tabId), 0);
        }
    }

    removePane(tabId: UUID, paneId: UUID) {
        this.tabs.find((tab) => tab.id === tabId)?.removePane(paneId);

        if (this.selectedTab?.id === tabId) {
            setTimeout(() => this.onTabFocused(tabId), 0);
        }
    }

    requestTabClosing(tabId: UUID) {
        const tab = this.tabs.find((tab) => tab.id === tabId);
        if (tab) {
            this.onTabRequestClose(tab.id);
        }
    }

    closeTab(tabId: UUID) {
        const tab = this.tabs.find((tab) => tab.id === tabId);
        if (tab) {
            this.hideDetailsCard();
            this.tabs.splice(this.tabs.indexOf(tab), 1);
            tab.element.style.animation = "tab-removed 140ms forwards";

            tab.element
                .querySelector(".close")
                ?.removeEventListener("click", tab.onCloseButtonClick);
            tab.resizeObserver.disconnect();
            tab.element.removeEventListener("mousedown", tab.onClick!);
            const closingTabIndex = tab.index;
            this.tabs.forEach((tab) => {
                if (tab.index > closingTabIndex) {
                    tab.index -= 1;
                    tab.element.style.order = `${tab.index}`;
                }
            });
            setTimeout(() => {
                tab.element.remove();
            }, 140);

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
            this.selectedTab.clearPanesAttention();
            tab.element.classList.add("selected");

            this.onTabFocused(tab.id);
            this.onFocusedTabTitleUpdated(tab.title);
        }
    }

    getSelected(): Tab {
        return this.selectedTab!;
    }

    private focusAndStartDragging(e: MouseEvent, target: Tab) {
        if (
            (e.target as HTMLElement).classList.contains("close") ||
            this.tabs.length === 1
        ) {
            return;
        }
        e.preventDefault();
        this.select(target.id);

        this.movingTab = target;
        this.initialMousePosition = e.clientX;
        this.initialOffsetLeft = this.movingTab.element.offsetLeft;

        this.movingTab.element.style.animation = "";

        this.nextTab = this.tabs.find(
            (item) => item.index === this.movingTab!.index + 1
        );
        this.prevTab = this.tabs.find(
            (item) => item.index === this.movingTab!.index - 1
        );
    }

    private inDragging(movingTab: Tab, deltaX: number) {
        movingTab.element.classList.add("dragging");

        if (
            this.initialOffsetLeft + deltaX > 0 &&
            deltaX + movingTab.element.clientWidth + this.initialOffsetLeft <
                this.target.clientWidth
        ) {
            movingTab.element.style.transform = `translateX(${deltaX}px)`;
        } else if (this.initialOffsetLeft + deltaX < 0) {
            movingTab.element.style.transform = `translateX(${-this
                .initialOffsetLeft}px)`;
        } else if (
            deltaX + movingTab.element.clientWidth + this.initialOffsetLeft >
            this.target.clientWidth
        ) {
            movingTab.element.style.transform = `translateX(${
                this.target.clientWidth -
                movingTab.element.clientWidth -
                this.initialOffsetLeft
            }px)`;
        }

        const deltaIndex = Math.round(deltaX / movingTab.element.clientWidth);
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
                movingTab.index += 1;
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
                movingTab.index -= 1;
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

    private stopDragging(movingTab: Tab) {
        const matrix = new WebKitCSSMatrix(
            window.getComputedStyle(movingTab.element).transform
        );
        const deltaX = matrix.m41;

        this.tabsMovedLeft.forEach((tab) => {
            tab.element.style.order = `${Number(tab.element.style.order) - 1}`;
            tab.index = Number(tab.element.style.order);
        });

        this.tabsMovedRight.forEach((tab) => {
            tab.element.style.order = `${Number(tab.element.style.order) + 1}`;
            tab.index = Number(tab.element.style.order);
        });

        this.tabs.forEach((tab) => {
            tab.element.classList.remove("moved");
            tab.element.style.transform = "";
        });

        movingTab.element.style.order = `${movingTab.index}`;

        const deltaIndex = Math.round(
            deltaX / this.movingTab!.element.clientWidth
        );

        movingTab.element.style.transform = `translateX(${
            matrix.m41 - deltaIndex * movingTab.element.clientWidth
        }px)`;

        movingTab.index = Number(movingTab.element.style.order);

        const movedTab = this.movingTab!;
        movedTab.element.style.animation =
            "tab-slide-to-center 140ms ease-in-out forwards";

        movedTab.element.addEventListener(
            "animationend",
            (e) => {
                const movedTab = e.target as HTMLElement;
                movedTab.classList.remove("dragging");
                movedTab.style.transform = "";
                movedTab.style.animation = "";
            },
            { once: true }
        );

        this.movingTab = undefined;
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
