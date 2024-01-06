import { Catch, ExceptionFilter } from '@nestjs/common';
import { ipLogsMap } from "./middlewareLogs";

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
    catch(exception, host) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse();
        const request = ctx.getRequest();
        // const status = exception.getStatus();
        const ip = request?.ip;

        console.log('exception ===', exception.message);
        const message = `${request.originalUrl} ${exception.message}`;
        ipLogsMap[ip] = ipLogsMap[ip] || {};
        ipLogsMap[ip][message] = ipLogsMap[ip][message] || 0;
        ipLogsMap[ip][message] = ipLogsMap[ip][message] + 1;
        return response
            .json({
                statusCode: 500,
                timestamp: new Date().toISOString(),
                path: request.url,
            });
    }
}
