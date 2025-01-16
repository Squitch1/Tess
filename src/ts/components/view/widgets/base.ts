import Pane from "../pane";

export default abstract class Widget {
    readonly id: string;
    readonly element: HTMLElement;

    anchoringPane?: Pane;

    onTitleUpdate: (title: string) => void;
    onHighlightRequest: () => void;
    onProgressUpdated: (progress: number) => void;

    onceClosed: () => void;

    constructor() {
        this.id = crypto.randomUUID();

        this.element = document.createElement("div");
        this.element.classList.add("widget");

        this.onTitleUpdate = () => {};
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
