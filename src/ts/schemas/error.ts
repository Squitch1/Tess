import { UUID } from "crypto";

import Widget from "@/components/view/widgets/base";

export class FancyError extends Error {
    title: string;

    constructor(message: string, title?: string) {
        super(message);

        this.title = title ?? "Unknown error";
    }
}

export class PtyCreateError extends FancyError {}
export class PtyResizeError extends FancyError {}
export class PtyWriteError extends FancyError {}
export class PtyExitError extends FancyError {}
export class PtyPropertyError extends FancyError {}

export class UnknownProfileError extends FancyError {
    constructor(profileId: UUID) {
        super(`There is no profile with ID ${profileId}.`, "Unknown profile");
    }
}
export class UnknownMacroError extends FancyError {
    constructor(macroId: UUID) {
        super(`There is no macro with ID ${macroId}.`, "Unknown macro");
    }
}
export class UnknownTerminalError extends FancyError {
    constructor(message?: string) {
        super(
            message ?? "There is no focused terminal available.",
            "Unknown terminal"
        );
    }
}

export class PaneOutOfCapacityError extends FancyError {
    target: Widget;

    constructor(title: string, target: Widget) {
        super(
            `You can only have ${MAX_SPLITS_PER_PANE} sub-panes per pane.`,
            title
        );
        this.target = target;
    }
}

export class ViewSelectSpecificPaneError extends FancyError {
    type: SelectSpecificPathRejectionReason;

    constructor(
        type: SelectSpecificPathRejectionReason,
        message?: string,
        title?: string
    ) {
        super(message ?? "", title ?? "Unable to split the pane");
        this.type = type;
    }
}
export enum SelectSpecificPathRejectionReason {
    userAborted,
    backward,
    appAborted,
}

export class UnkownSplitPathError extends FancyError {
    target: Widget;

    constructor(target: Widget) {
        super("There is no pane to split.", "Unable to split the pane");
        this.target = target;
    }
}
