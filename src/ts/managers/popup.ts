import { PopupBuilder, PopupResult } from "@/components/interface/popup";

export default class PopupManager {
    waitingQueue: [PopupBuilder, HTMLElement, (value: unknown) => void][] = [];
    usedTarget: HTMLElement[] = [];

    onPopupClosed: () => void;

    constructor() {
        this.onPopupClosed = () => {};
    }

    sendPopup(
        popupBuilder: PopupBuilder,
        target: HTMLElement = document.body
    ): Promise<PopupResult> {
        return new Promise(async (resolve) => {
            if (
                this.usedTarget.find(
                    (registredTarget) => registredTarget === target
                )
            ) {
                await new Promise((resolve) => {
                    this.waitingQueue.push([popupBuilder, target, resolve]);
                });
            } else {
                this.usedTarget.push(target);
            }

            let onTargetGetFocus: (e: FocusEvent) => void;

            const popupBuilt = popupBuilder.build((action, doNotShowAgain) => {
                target.removeEventListener("focusin", onTargetGetFocus);

                popupBuilt.style.animation =
                    "popup-added-background-fade 140ms forwards reverse";

                popupBuilt.querySelector<HTMLElement>(
                    ".popup"
                )!.style.animation = "zoom-fade 140ms forwards reverse";

                this.onPopupClosed();

                setTimeout(() => {
                    target.removeChild(popupBuilt);
                    this.popupClosed(target);
                }, 140);
                resolve({
                    action,
                    doNotShowAgain,
                });
            });

            const focusableElements = Array.from(
                popupBuilt.querySelectorAll<HTMLElement>("[tabindex]")
            );
            const firstElement = focusableElements[0];
            const lastElement = focusableElements[focusableElements.length - 1];
            let focusedButton = focusableElements.find(
                (element) =>
                    element.classList.contains("button") &&
                    element.classList.contains("dismiss")
            )!;

            popupBuilt.addEventListener("keydown", (e) => {
                if (target === document.body) {
                    e.stopImmediatePropagation();
                }
                e.preventDefault();

                if (e.code === "Tab") {
                    if (
                        document.activeElement === popupBuilt ||
                        (!e.shiftKey && document.activeElement === lastElement)
                    ) {
                        focusedButton = firstElement;
                    } else if (
                        e.shiftKey &&
                        document.activeElement === firstElement
                    ) {
                        focusedButton = lastElement;
                    } else {
                        focusedButton =
                            focusableElements[
                                focusableElements.indexOf(
                                    document.activeElement as HTMLElement
                                ) + (e.shiftKey ? -1 : 1)
                            ];
                    }
                    focusedButton.focus();
                } else if (e.key === "Enter") {
                    (document.activeElement as HTMLElement).click();
                }
            });

            popupBuilt.style.animation =
                "popup-added-background-fade 140ms forwards";
            popupBuilt.querySelector<HTMLElement>(".popup")!.style.animation =
                "zoom-fade 140ms forwards";

            setTimeout(() => {
                popupBuilt.style.animation = "";
                popupBuilt.querySelector<HTMLElement>(
                    ".popup"
                )!.style.animation = "";
            }, 140);

            popupBuilt.setAttribute("tabindex", "0");
            target.appendChild(popupBuilt);

            target.addEventListener(
                "focusin",
                (onTargetGetFocus = (e) => {
                    if (!popupBuilt.contains(e.target as Node)) {
                        focusedButton.focus();
                    }
                })
            );

            focusedButton.focus();
        });
    }

    private popupClosed(target: HTMLElement) {
        const waitingPopup = this.waitingQueue.find(
            (item) => item[1] === target
        );
        if (waitingPopup) {
            this.waitingQueue.splice(
                this.waitingQueue.indexOf(waitingPopup),
                1
            );
            waitingPopup[2](null);
        } else {
            this.usedTarget.splice(this.usedTarget.indexOf(target), 1);
        }
    }
}
