import { Injectable } from '@nestjs/common';

@Injectable()
export class GlobalMiddleware {
    use(req, res, next) {
        console.log('Request...', req.ip);
        next();
    }
}
