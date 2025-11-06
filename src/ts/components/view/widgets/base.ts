import { UUID } from "crypto";

import Pane from "../pane";

export default abstract class Widget {
    readonly id: UUID;
    readonly element: HTMLElement;

    initialTitle?: string;
    anchoringPane?: Pane;

    onTitleUpdate: (title: string) => void;
    onHighlightRequest: () => void;
    onProgressUpdated: (progress: number) => void;

    onceClosed: () => void;

    constructor() {
        this.id = crypto.randomUUID();

        this.element = document.createElement("div");
        this.element.classList.add("widget");

        this.onTitleUpdate = (title) => {
            this.initialTitle = title;
        };
        this.onHighlightRequest = () => {};
        this.onProgressUpdated = () => {};

        this.onceClosed = () => {};
    }

    abstract run(): void;
    abstract getShortTitle(): Promise<string>;
    abstract getClosability(): Promise<boolean>;
    abstract close(): Promise<void>;

    focus() {
        this.element.focus();
    }

    blur() {
        this.element.blur();
    }

    // eslint-disable-next-line class-methods-use-this
    dispose() {}
}
