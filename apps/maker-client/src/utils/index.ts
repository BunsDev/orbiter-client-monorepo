import { ethers } from "ethers6"


export function decodeInscriptionCalldata(data: string) {
    const utf8String = ethers.toUtf8String(data);
    return JSON.parse(utf8String.split('data:,')[1]);
}
export function truncateEthAddress(address: string): string {
    if (!address) {
        return '';
    }
    const truncatedAddress = address.substring(0, 8) + "..." + address.substring(address.length - 6);
    return truncatedAddress;
}

