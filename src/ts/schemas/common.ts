import { UUID } from "crypto";

export type showToastPayload = {
    title: string;
    message?: string;
    type?: "error" | "warn" | "info";
};

export type openTabPayload = {
    profile?: openTabProfilePayload;
};

export type openTabProfilePayload = {
    id?: UUID;
    command?: string;
    workdir?: string;
    title?: string;
};
