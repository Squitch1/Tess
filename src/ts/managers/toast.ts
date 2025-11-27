import { FancyError } from "@/schemas/error";

import hasCSSAnimation from "@/utils/dom";

export default class Toaster extends EventTarget {
    private target: Element;
    private toasts: HTMLDivElement[] = [];

    constructor(target: Element) {
        super();
        this.target = target;
    }

    toast(e: Error): void;
    toast(
        title: string,
        message?: string,
        type?: "info" | "warn" | "error"
    ): void;
    toast(
        title: string | Error,
        message?: string,
        type: "info" | "warn" | "error" = "info"
    ) {
        if (title instanceof Error) {
            message = title.message;
            title = title instanceof FancyError ? title.title : "Unknown error";
            type = "error";
        }

        const toast = document.createElement("div");
        toast.classList.add("toast");

        const toastContent = document.createElement("div");
        toastContent.classList.add("content");

        const toastTitle = document.createElement("span");
        toastTitle.classList.add("title");
        toastTitle.innerText = title;

        const toastIcon = document.createElementNS(SVGNamespace, "svg");
        toastIcon.setAttribute("fill", "currentColor");
        toastIcon.setAttribute("viewBox", "0 0 20 20");
        toastIcon.classList.add("icon");
        switch (type) {
            case "error":
                toastIcon.innerHTML =
                    '<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clip-rule="evenodd" />';
                break;
            case "warn":
                toastIcon.innerHTML =
                    '<path fill-rule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clip-rule="evenodd" />';
                break;
            case "info":
                toastIcon.innerHTML =
                    '<path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clip-rule="evenodd" />';
                break;
        }

        toastContent.appendChild(toastTitle);

        const toastActions = document.createElement("div");
        toastActions.classList.add("actions");

        const dismissToastButton = document.createElement("div");
        dismissToastButton.classList.add("close");

        dismissToastButton.innerHTML = `
            <svg viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
            </svg>
        `;

        toastActions.appendChild(dismissToastButton);

        let toastMessage;
        if (message) {
            const toastMessageWrapper = document.createElement("div");

            toastMessage = document.createElement("span");
            toastMessageWrapper.classList.add("message");
            toastMessage.innerText = message;

            toastMessageWrapper.appendChild(toastMessage);

            toastContent.appendChild(toastMessageWrapper);
        }

        toast.append(toastIcon, toastContent, toastActions);

        this.target.appendChild(toast);

        const toastHeight = toast.clientHeight;
        this.toasts.forEach((toast) => {
            toast.style.transform = `translateY(${toastHeight + 12}px)`;
            toast.style.animation = hasCSSAnimation(toast, "toast-removed")
                ? "toast-removed 140ms forwards"
                : "";
            // eslint-disable-next-line no-unused-expressions
            toast.offsetTop;
            toast.style.animation = hasCSSAnimation(toast, "toast-removed")
                ? "toast-slide 140ms forwards, toast-removed 140ms forwards"
                : "toast-slide 140ms forwards";
        });

        this.toasts.push(toast);

        toastTitle.classList.toggle(
            "clipped",
            toastTitle.scrollWidth > toastTitle.clientWidth
        );

        toast.addEventListener("mouseenter", () =>
            toastTitle.classList.toggle(
                "clipped",
                toastTitle.scrollWidth > toastTitle.clientWidth
            )
        );
        toast.addEventListener("mouseleave", () =>
            toastTitle.classList.toggle(
                "clipped",
                toastTitle.scrollWidth > toastTitle.clientWidth
            )
        );

        if (
            toastMessage &&
            toastMessage.scrollHeight > toastMessage.clientHeight
        ) {
            toast.classList.add("expandable");

            const expandToastButton = document.createElement("div");
            expandToastButton.classList.add("expand");
            expandToastButton.innerHTML = `
            <svg viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd" />
            </svg>
            `;

            toastActions.appendChild(expandToastButton);

            expandToastButton.addEventListener("click", () =>
                toast.classList.toggle("expanded")
            );
        }

        let closeButtonListener;
        let closeTimeout: ReturnType<typeof setTimeout>;

        toast.addEventListener("pointerdown", () => {
            const element = document.activeElement as HTMLElement | null;
            requestAnimationFrame(() => element?.focus());
        });

        dismissToastButton.addEventListener(
            "click",
            (closeButtonListener = () => {
                clearTimeout(closeTimeout);
                if (hasCSSAnimation(toast, "toast-slide")) {
                    toast.style.animation += ",toast-removed 140ms forwards";
                } else {
                    toast.style.animation = "toast-removed 140ms forwards";
                }

                const toastsToSlideDown = this.toasts.slice(
                    0,
                    this.toasts.indexOf(toast)
                );
                this.toasts.splice(this.toasts.indexOf(toast), 1);

                setTimeout(() => {
                    const toastHeight = toast.clientHeight;
                    toast.remove();

                    toastsToSlideDown.forEach((toast) => {
                        toast.style.transform = `translateY(-${
                            toastHeight + 12
                        }px)`;
                        toast.style.animation = hasCSSAnimation(
                            toast,
                            "toast-removed"
                        )
                            ? "toast-removed 140ms forwards"
                            : "";
                        // eslint-disable-next-line no-unused-expressions
                        toast.offsetTop;
                        toast.style.animation = hasCSSAnimation(
                            toast,
                            "toast-removed"
                        )
                            ? "toast-slide 140ms forwards, toast-removed 140ms forwards"
                            : "toast-slide 140ms forwards";
                    });
                }, 140);
            }),
            { once: true }
        );

        closeTimeout = setTimeout(() => {
            dismissToastButton.removeEventListener(
                "click",
                closeButtonListener
            );

            if (hasCSSAnimation(toast, "toast-slide")) {
                toast.style.animation += ",toast-removed 140ms forwards";
            } else {
                toast.style.animation = "toast-removed 140ms forwards";
            }

            setTimeout(() => {
                this.toasts.splice(this.toasts.indexOf(toast), 1);
                toast.remove();
            }, 140);
        }, 20_000);
    }
}
