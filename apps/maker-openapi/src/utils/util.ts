import moment from "moment";

export function getFormatDate(date?) {
    const timestamp = new Date(date || new Date().valueOf());
    return moment(timestamp).utcOffset(getTimeZoneString(8)).format('YYYY-MM-DD HH:mm:ss');
}

function getTimeZoneString(timeZone) {
    return `${timeZone < 0 ? '-' : '+'}${Math.abs(timeZone) < 10 ? '0' + Math.abs(timeZone) : Math.abs(timeZone)}:00`;
}
