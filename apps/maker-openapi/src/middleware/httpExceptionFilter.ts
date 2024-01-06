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

        const message: string = exception?.message;
        if (message && message.indexOf("ex:") === 0) {

            const msg = `${request.originalUrl} ${message.replace('ex: ', '')}`;
            ipLogsMap[ip] = ipLogsMap[ip] || {};
            ipLogsMap[ip][msg] = ipLogsMap[ip][msg] || 0;
            ipLogsMap[ip][msg] = ipLogsMap[ip][msg] + 1;
            return response
                .json({
                    errno: 1000,
                    errmsg: message.replace('ex: ', '')
                });
        }
        console.error(exception);
        return response
            .json({
                errno: 500,
                errmsg: "Internal server error",
            });
    }
}
