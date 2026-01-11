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
            doNotShowAgainCheckbox.tabIndex = 0;

            doNotShowAgainInput.append(
                doNotShowAgainCheckbox,
                doNotShowAgainText
            );

            doNotShowAgainElement.appendChild(doNotShowAgainInput);
            popupButtons.appendChild(doNotShowAgainElement);
        }

        let hasDismissButtons = false as boolean;
        if (this.buttons.length > 0) {
            let hasValidateButton = false;

            this.buttons.forEach((button) => {
                if (
                    (hasValidateButton && button.type === "validate") ||
                    (hasDismissButtons && button.type === "dismiss")
                ) {
                    return;
                }

                const buttonElement = document.createElement("div");
                buttonElement.classList.add("button");
                buttonElement.innerText = button.content;
                buttonElement.tabIndex = 0;
                buttonElement.addEventListener("click", () =>
                    callback(button.actionId, doNotShowAgainCheckbox?.checked)
                );
                popupButtons.appendChild(buttonElement);

                if (button.type === "validate") {
                    buttonElement.classList.add("primary");
                    hasValidateButton = true;
                } else if (button.type === "dismiss") {
                    buttonElement.classList.add("dismiss");
                    hasDismissButtons = true;
                }
            });
        }

        if (!hasDismissButtons) {
            const buttonElement = document.createElement("div");
            buttonElement.classList.add("button", "dismiss");
            buttonElement.innerText = "dismiss";
            buttonElement.addEventListener("click", () =>
                callback("dismiss", doNotShowAgainCheckbox?.checked)
            );
            buttonElement.tabIndex = 0;
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
