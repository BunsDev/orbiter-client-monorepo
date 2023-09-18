// worker.service.ts

import { Injectable } from '@nestjs/common';
import { Worker, workerData } from 'worker_threads';
import * as path from 'path';
import { JSONStringify } from '@orbiter-finance/utils';

@Injectable()
export class WorkerService {
    async runTask(chainInfo: any, blockNumbers: number[]): Promise<any> {
        return new Promise((resolve, reject) => {
            // 创建 Worker 线程
            const worker = new Worker(path.resolve('scripts/rpcRequest', 'worker.js'), {
                workerData: {
                    chainInfo,
                    blockNumbers
                },
            });
            // 监听 Worker 的消息
            worker.on('message', (message) => {
                if (message.type === 'debug') {
                    console.debug(JSONStringify(message.data))
                } else if (message.type === 'data') {
                    resolve(message.data);
                }
            });

            // 监听 Worker 的错误
            worker.on('error', (error) => {
                reject(error);
            });

            // 向 Worker 发送消息
            worker.postMessage('exec');
        });
    }
}
