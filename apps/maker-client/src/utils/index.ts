import { ethers } from "ethers6"


export function decodeInscriptionCalldata(data:string) {
    const utf8String = ethers.toUtf8String(data);
    return JSON.parse(utf8String.split('data:,')[1]);
}