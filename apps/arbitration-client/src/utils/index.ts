export async function HTTPGet<T>(
    url: string,
    headers?: Record<string, string>,
): Promise<T> {
    let agent = null;
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