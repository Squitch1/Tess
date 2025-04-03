export type showToastPayload = {
    title: string;
    message?: string;
    type?: "error" | "warn" | "info";
};

export type openTabPayload = {
    profile?: openTabProfilePayload;
};

export type openTabProfilePayload = {
    uuid: string;
    executable?: string;
};
