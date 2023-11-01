import { padStart } from 'lodash';

export function addressPadStart(address: string, length: number) {
    if (!address) {
        return address;
    }
    address = address.replace('0x', '');
    if (address.length < length) {
        return `0x${padStart(address, length - 2, '0')}`;
    }
    return address;
}
export function generateSequenceNumbers(
    min: number,
    max: number,
) {
    // save pending scan block
    const blockNumbers = Array.from(
        { length: max - min + 1 },
        (_, index) => min + index,
    );
    return blockNumbers;
}