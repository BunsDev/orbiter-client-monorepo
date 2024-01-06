import { Injectable } from '@nestjs/common';
import { ipLogsMap } from "./middlewareLogs";

@Injectable()
export class GlobalMiddleware {
    use(req, res, next) {
        const message = String(req?.originalUrl || '').split('?')[0];
        ipLogsMap[req.ip] = ipLogsMap[req.ip] || {};
        ipLogsMap[req.ip][message] = ipLogsMap[req.ip][message] || 0;
        ipLogsMap[req.ip][message] = ipLogsMap[req.ip][message] + 1;
        next();
    }
}
