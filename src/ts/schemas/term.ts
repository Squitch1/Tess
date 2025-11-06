import { UUID } from "crypto";

export type PtyDataPayload = {
    data: string;
    ptyId: UUID;
};

export type PtyTitleChangedPayload = {
    title: string;
    ptyId: UUID;
};

export type PtyProgressUpdatedPayload = {
    progress: number;
    ptyId: UUID;
};
