export type terminalDataPayload = {
    data: string;
    uuid: string;
};

export type terminalTitleChangedPayload = {
    title: string;
    uuid: string;
};

export type terminalProgressUpdatedPayload = {
    progress: number;
    uuid: string;
};
