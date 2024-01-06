import { Injectable } from '@nestjs/common';
import { ipLogsMap } from "./middlewareLogs";

@Injectable()
export class GlobalMiddleware {
    use(req, res, next) {
        ipLogsMap[req.ip] = ipLogsMap[req.ip] || {};
        ipLogsMap[req.ip][req.originalUrl] = ipLogsMap[req.ip][req.originalUrl] || 0;
        ipLogsMap[req.ip][req.originalUrl] = ipLogsMap[req.ip][req.originalUrl] + 1;
        next();
    }
}
