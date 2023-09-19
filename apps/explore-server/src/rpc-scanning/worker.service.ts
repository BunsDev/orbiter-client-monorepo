// worker.service.ts

import { Injectable } from '@nestjs/common';
import { Worker, workerData } from 'worker_threads';
import * as path from 'path';
import { JSONStringify } from '@orbiter-finance/utils';
import { v4 } from 'uuid'
import os from 'os'
const CPU_NUMBER = os.cpus().length
const MAX_WORKER_NUMBER = Math.max(6, CPU_NUMBER)

interface IWaitRequest {
  msgId: string,
  params: any,
  callback: (...args: any) => void
  startTime: number,
  expires: number
}

interface IMessage<T = any> {
  action: string,
  type: string
  data: T
  id: string
}

@Injectable()
export class WorkerService {
    private workers: Worker[]
    private executorIndex: number
    private waitRequests: Map<string, IWaitRequest>
    constructor () {
      this.executorIndex = 0
      this.workers = []
      this.waitRequests = new Map()
    }
    createWorker(workerIndex: number) {
      const workerPath = path.resolve(__filename)
      const worker = new Worker(workerPath);
      worker.on('message', this.handleWorkerMessage.bind(this));
      worker.on('error', () => {
        this.workers[workerIndex] = this.createWorker(workerIndex)
      })
      return worker
    }
    async handleWorkerMessage(message: IMessage) {
      const msgId = message.id;
      const request = this.waitRequests.get(msgId)
      const now = Date.now()
      if (now - request.startTime > request.expires) {
        return
      }
      console.log(`WorkerService.handleWorkerMessage msgId: ${message.id}, type:${message.type}`)
      if (message.type === 'error') {
        request.callback(new Error(message.data))
      } else {
        request.callback(null, message.data)
      }
      this.waitRequests.delete(msgId)
    }
    getWorker() {
      console.log(`WorkerService.getWorker executorIndex: ${this.executorIndex}, MAX_WORKER_NUMBER:${MAX_WORKER_NUMBER}`)
      if (this.executorIndex < 0) {
        this.executorIndex = 0
      }
      let worker = this.workers[this.executorIndex]
      if (worker && worker.threadId) {
        this.executorIndex++
        this.executorIndex = this.executorIndex % MAX_WORKER_NUMBER
        return worker
      }
      worker = this.createWorker(this.executorIndex)
      this.workers[this.executorIndex] = worker
      this.executorIndex++
      this.executorIndex = this.executorIndex % MAX_WORKER_NUMBER
      return worker
    }
    getMsgId() {
      return v4()
    }
    runTask<T = any>(action: string, data: T): Promise<any> {
      return new Promise((resolve, reject) => {
        const worker = this.getWorker()
        const msgId =  this.getMsgId()
        const msg: IMessage = {
          id: msgId,
          data,
          action,
          type: 'request'
        }
        const rejectTimer = setTimeout(() => {
          reject()
        }, 1000 * 30)
        const callback = (error, responseData) => {
          if (error) {
            reject(error)
            return
          }
          clearTimeout(rejectTimer)
          resolve(responseData)
        }

        this.waitRequests.set(msgId, {
          msgId,
          callback: callback,
          startTime: Date.now(),
          expires: 1000 * 30,
          params: data
        })
        worker.postMessage(JSONStringify(msg))
      })
    }
    // async runTask(chainInfo: any, blockNumbers: number[]): Promise<any> {
    //     return new Promise((resolve, reject) => {
    //         // 创建 Worker 线程
    //         // const worker = new Worker(path.resolve('scripts/rpcRequest', 'worker.js'), {
    //         //     workerData: {
    //         //         chainInfo,
    //         //         blockNumbers
    //         //     },
    //         // });
    //         const workerPath = path.resolve(__filename)
    //         console.log('-------workerPath', workerPath)
    //         const worker = new Worker((workerPath), {
    //           workerData: {
    //               chainInfo,
    //               blockNumbers
    //           },
    //         });
    //         // 监听 Worker 的消息
    //         worker.on('message', (message) => {
    //             if (message.type === 'debug') {
    //                 console.debug(JSONStringify(message.data))
    //             } else if (message.type === 'data') {
    //                 resolve(message.data);

    //                 // worker.postMessage('close');
    //                 worker.terminate()
    //             }
    //         });

    //         // 监听 Worker 的错误
    //         worker.on('error', (error) => {
    //             reject(error);
    //         });

    //         // 向 Worker 发送消息
    //         worker.postMessage(JSON.stringify({
    //           chainInfo,
    //           blockNumbers
    //         }));
    //     });
    // }
}
