import { Injectable } from '@nestjs/common';
import { aggregationLog } from "../utils/logger";

@Injectable()
export class GlobalMiddleware {
    use(req, res, next) {
        const message = String(req?.originalUrl || '').split('?')[0];
        aggregationLog(`${req.ip} ${message}`);
        next();
    }
}
