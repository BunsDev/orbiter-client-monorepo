import { routerLogger } from "./logger";

export const registerMap = {};

export function ipRegister(ip: string) {
    if (!registerMap[ip]) {
        registerMap[ip] = 1;
        routerLogger.info(`${ip} register successfully, current ip list ${Object.keys(registerMap).join(', ')}`);
    }
}


export function isRegister(ip: string) {
    if (!registerMap[ip]) {
        routerLogger.info(`${ip} not registered`);
        return false;
    }
    return true;
}
