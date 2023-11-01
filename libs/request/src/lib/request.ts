import { HttpsProxyAgent } from 'https-proxy-agent';
export async function HTTPGet<T>(
    url: string,
    headers?: Record<string, string>,
): Promise<T> {
    let agent = null;
    if (headers && headers['proxy']) {
        agent = new HttpsProxyAgent(headers['proxy']);
    }
    // export https_proxy=http://127.0.0.1:7890 http_proxy=http://127.0.0.1:7890 all_proxy=socks5://127.0.0.1:7890
    const options: RequestInit = {
        method: 'GET',
        headers: headers,
        agent,
    } as any;

    const response: Response = await fetch(url, options);
    const data: T = await response.json();
    return data;
}

export async function HTTPPost<T>(
    url: string,
    data: any,
    headers?: Record<string, string>,
): Promise<T> {
    const options: RequestInit = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...headers,
        },
        body: JSON.stringify(data),
    };

    const response: Response = await fetch(url, options);
    const responseData: T = await response.json();
    return responseData;
}