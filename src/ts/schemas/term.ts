export type terminalDataPayload = {
    data: string;
    id: string;
};

export type terminalTitleChangedPayload = {
    title: string;
    id: string;
};

export type terminalProgressUpdatedPayload = {
    progress: number;
    id: string;
};
