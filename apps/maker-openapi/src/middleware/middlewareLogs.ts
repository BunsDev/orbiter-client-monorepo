export let ipLogsMap = {};

setInterval(() => {
    for (const ip in ipLogsMap) {
        for (const message in ipLogsMap[ip]) {
            console.log(ip, message, ipLogsMap[ip][message]);
        }
    }
    ipLogsMap = {};
}, 60 * 1000);
