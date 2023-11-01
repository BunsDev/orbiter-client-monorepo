export class HTTPResponse {
    // static success(errno: number, errmsg?: string, data?: any) {
    //     return {
    //         errno,
    //         errmsg,
    //         data
    //     }
    // }
    static success(data: any) {
        return {
            errno: 0,
            errmsg: "success",
            data
        }
    }
    static fail(errno: number, errmsg?: string, data?: any) {
        return {
            errno: 1000,
            errmsg,
            data
        }
    }
}