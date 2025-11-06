import { UUID } from "crypto";

export type ShowToastPayload = {
    title: string;
    message?: string;
    type?: "error" | "warn" | "info";
};

export type OpenTabPayload = {
    profile?: OpenTabProfilePayload;
};

export type OpenTabProfilePayload = {
    id?: UUID;
    command?: string;
    workdir?: string;
    title?: string;
};
