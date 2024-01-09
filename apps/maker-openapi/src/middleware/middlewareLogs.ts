import { routerLogger } from "../utils/logger";

export let ipLogsMap = {};

setInterval(() => {
    for (const ip in ipLogsMap) {
        for (const message in ipLogsMap[ip]) {
            routerLogger.info(ip, message, ipLogsMap[ip][message]);
        }
    }
    ipLogsMap = {};
}, 20 * 60 * 1000);
