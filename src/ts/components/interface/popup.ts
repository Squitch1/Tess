export class PopupBuilder {
    private title: string;
    private message?: string;
    private doNotShowAgain: boolean = false;
    private buttons: PopupButton[] = [];

    constructor(title: string) {
        this.title = title;
    }

    withMessage(message: string): this {
        this.message = message;
        return this;
    }

    withDoNotShowAgain(activate: boolean): this {
        this.doNotShowAgain = activate;
        return this;
    }

    withButtons(...buttons: PopupButton[]): this {
        buttons.sort((a, b) => {
            if (a.type === b.type) {
                return 0;
            }
            if (
                (a.type === "custom" && b.type === "validate") ||
                a.type === "dismiss"
            ) {
                return -1;
            }
            return 1;
        });

        this.buttons = buttons;
        return this;
    }

    build(
        callback: (action: string, doNotShowAgain?: boolean) => void
    ): HTMLElement {
        const popupBackdrop = document.createElement("div");
        popupBackdrop.classList.add("popup-backdrop");

        const popup = document.createElement("div");
        popup.classList.add("popup");

        const popupTitle = document.createElement("span");
        popupTitle.classList.add("title");
        popupTitle.innerText = this.title;

        popup.appendChild(popupTitle);

        if (this.message) {
            const popupMessage = document.createElement("div");
            popupMessage.innerText = this.message;
            popupMessage.classList.add("message");

            popup.appendChild(popupMessage);
        }

        const popupButtons = document.createElement("div");
        popupButtons.classList.add("buttons");

        let doNotShowAgainCheckbox: HTMLInputElement | undefined;
        if (this.doNotShowAgain) {
            const doNotShowAgainElement = document.createElement("div");
            doNotShowAgainElement.classList.add("do-not-show-again");

            const doNotShowAgainInput = document.createElement("label");

            const doNotShowAgainText = document.createElement("span");
            doNotShowAgainText.innerText = "Don't show again";

            doNotShowAgainCheckbox = document.createElement("input");
            doNotShowAgainCheckbox.type = "checkbox";
            doNotShowAgainCheckbox.setAttribute("tabindex", "0");

            doNotShowAgainInput.append(
                doNotShowAgainCheckbox,
                doNotShowAgainText
            );

            doNotShowAgainElement.appendChild(doNotShowAgainInput);
            popupButtons.appendChild(doNotShowAgainElement);
        }

        let hasDismissButtons = false;
        if (this.buttons.length > 0) {
            let hasValidateButton = false;

            this.buttons.forEach((button) => {
                if (!hasValidateButton && button.type === "validate") {
                    const buttonElement = document.createElement("div");
                    buttonElement.classList.add("button");
                    buttonElement.innerText = button.content;
                    buttonElement.addEventListener("click", () =>
                        callback(
                            button.actionId,
                            doNotShowAgainCheckbox?.checked
                        )
                    );
                    buttonElement.classList.add("primary");
                    buttonElement.setAttribute("tabindex", "0");

                    popupButtons.appendChild(buttonElement);

                    hasValidateButton = true;
                } else if (!hasDismissButtons && button.type === "dismiss") {
                    const buttonElement = document.createElement("div");
                    buttonElement.classList.add("button", "dismiss");
                    buttonElement.innerText = button.content;
                    buttonElement.addEventListener("click", () =>
                        callback(
                            button.actionId,
                            doNotShowAgainCheckbox?.checked
                        )
                    );
                    buttonElement.setAttribute("tabindex", "0");

                    popupButtons.appendChild(buttonElement);

                    hasDismissButtons = true;
                } else if (button.type === "custom") {
                    const buttonElement = document.createElement("div");
                    buttonElement.classList.add("button");
                    buttonElement.innerText = button.content;
                    buttonElement.addEventListener("click", () =>
                        callback(
                            button.actionId,
                            doNotShowAgainCheckbox?.checked
                        )
                    );
                    buttonElement.setAttribute("tabindex", "0");

                    popupButtons.appendChild(buttonElement);
                }
            });
        }

        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (!hasDismissButtons) {
            const buttonElement = document.createElement("div");
            buttonElement.classList.add("button", "dismiss");
            buttonElement.innerText = "dismiss";
            buttonElement.addEventListener("click", () =>
                callback("dismiss", doNotShowAgainCheckbox?.checked)
            );
            buttonElement.setAttribute("tabindex", "0");
            popupButtons.prepend(buttonElement);
        }

        popup.appendChild(popupButtons);
        popupBackdrop.appendChild(popup);
        return popupBackdrop;
    }
}

export class PopupButton {
    #type: "dismiss" | "validate" | "custom";
    #content: string;
    #actionId: string;

    constructor(
        content: string,
        type: "dismiss" | "validate" | "custom" = "dismiss",
        actionId: string = content
    ) {
        this.#content = content;
        this.#actionId = actionId;
        this.#type = type;
    }

    get type() {
        return this.#type;
    }

    get content() {
        return this.#content;
    }

    get actionId() {
        return this.#actionId;
    }
}

export type PopupResult = {
    action: string;
    doNotShowAgain?: boolean;
};
