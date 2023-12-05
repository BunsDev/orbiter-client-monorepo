
import { Observable, throwError } from 'rxjs'
import { catchError } from 'rxjs/operators'
import { Injectable, NestInterceptor, CallHandler, ExecutionContext } from '@nestjs/common'
import { getResponserOptions } from '../decorators/responser.decorator'
import { CustomError } from '../errors/custom.error'

/**
 * @class ErrorInterceptor
 * @classdesc catch error when controller Promise rejected
 */
@Injectable()
export class ErrorInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler<any>): Observable<any> {
    const target = context.getHandler()
    const { errorCode, errorMessage } = getResponserOptions(target)
    return next.handle().pipe(
      catchError((error) => {
        return throwError(
          () => new CustomError({ message: errorMessage ||"CusError", error }, errorCode)
        )
      })
    )
  }
}
