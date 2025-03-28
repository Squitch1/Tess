import { Settings } from "schemas/settings";

declare global {
    // eslint-disable-next-line vars-on-top, no-var
    var settings: Settings;
}
