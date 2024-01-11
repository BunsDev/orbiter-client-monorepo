import { Catch, ExceptionFilter } from '@nestjs/common';
import { aggregationLog, routerLogger } from "../utils/logger";

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
    catch(exception, host) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse();
        const request = ctx.getRequest();
        // const status = exception.getStatus();
        const ip = request?.ip;

        const message: string = exception?.message;
        if (message && message.indexOf("ex:") === 0) {
            const msg = `${request.originalUrl} ${message.replace('ex: ', '')}`;
            aggregationLog(`${ip} ${msg}`);
            return response
                .json({
                    errno: 1000,
                    errmsg: message.replace('ex: ', '')
                });
        }
        routerLogger.error(request?.originalUrl, exception);
        return response
            .json({
                errno: 500,
                errmsg: "Internal server error",
            });
    }
}
