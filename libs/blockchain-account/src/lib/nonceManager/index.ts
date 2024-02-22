import { Mutex } from "async-mutex";
import Keyv from "keyv";
import { EventEmitter } from 'events';

const FIVE_MINUTES_MS = 1000 * 60 * 5;

export interface Options {
  initNonce?:number;
  beforeCommit?:boolean;
}
export class NonceManager extends EventEmitter {
  private readonly mutex = new Mutex();

  constructor(
    private readonly refreshNonceFun: Function,
    private readonly store: Keyv,
    private readonly option?: Options
  ) {
    super();
    this.mutex.acquire().then(async (release) => {
      try {
        // Initialize nonce based on the maximum of refreshNonce, stored nonce, and initNonce
        const refreshNonce = await this.refreshNonceFun();
        const nonce = (await this.store.get("nonce")) || 0;
        const initNonce = (option && option.initNonce) || 0;
        const maxNonce = Math.max(refreshNonce, nonce, initNonce);

        // Update nonce if needed
        if (maxNonce !== nonce) {
          await this.setNonce(maxNonce);
        }
      } finally {
        release();
      }
    });
    if (!option || !option.initNonce) {
      this.forceRefreshNonce();
    }
    // Start the auto-update mechanism
    this.autoUpdate();
  }

  /**
   * Set the nonce value in the store.
   * @param nonce - The nonce value to set.
   */
  public async setNonce(nonce: number) {
    await this.store.set("nonce", nonce);
  }

  /**
   * Force a refresh of the nonce and update the store.
   */
  public async forceRefreshNonce() {
    try {
      const prevNonce = await this.getLocalNonce();
      const nonce = await this.refreshNonceFun();
      console.log(`forceRefreshNonce: originNonce:${prevNonce}, network:${nonce}`);
      await this.setNonce(nonce);
    } catch (error) {
      // Handle er.addListener
      throw error;
    }
  }

  /**
   * Periodically check for the need to refresh the nonce and update the last usage timestamp.
   */
  public async autoUpdate() {
    try {
      const lastUsage = await this.getLastUsageTime();
      let nonce = await this.store.get("nonce");
      // Check if it's time to refresh the nonce
      // if (Date.now() - lastUsage > FIVE_MINUTES_MS) {
      //   await this.forceRefreshNonce();
      // } else {
      this.handleAutoUpdate(nonce);
      // }
    } catch (error) {
      console.error(`autoUpdate error`, error);
      // Handle error during auto-update
    } finally {
      // Schedule the next auto-update after a delay
      setTimeout(() => this.autoUpdate(), FIVE_MINUTES_MS);
    }
  }

  /**
   * Get the last usage timestamp from the store.
   */
  private async getLastUsageTime(): Promise<number> {
    return await this.store.get("lastUsageTime");
  }

  /**
   * Handle the auto-update process, refreshing the nonce if needed and updating the last usage timestamp.
   */
  private async handleAutoUpdate(nonce: number) {
    const refreshNonce = await this.refreshNonceFun();
    if (refreshNonce > nonce) {
      await this.setNonce(refreshNonce);
    }
  }

  /**
   * Set the last usage timestamp in the store.
   * @param lastUsage - The timestamp of the last usage.
   */
  private async setLastUsageTime(lastUsage: number) {
    await this.store.set("lastUsageTime", lastUsage);
  }

  /**
   * Get the current nonce from the store.
   */
  public async getLocalNonce() {
    const nonce = await this.store.get("nonce");
    return +nonce;
  }

  /**
   * Get the next nonce, including functions to submit, rollback, and details about network and local nonces.
   */
  public async getNextNonce(): Promise<{
    nonce: number;
    submit: Function;
    rollback: Function;
    networkNonce: number;
    localNonce: number;
  }> {
    return await new Promise(async (resolve, reject) => {
      try {
        // Acquire the mutex to ensure thread safety
        const release = await this.mutex.acquire();
        try {
          // Get the network nonce and the local nonce from the store
          const networkNonce = await this.refreshNonceFun();
          const localNonce = await this.getLocalNonce();
          let useNonce = localNonce;
          // Update the nonce if the network nonce is greater
          if (networkNonce > localNonce) {
            useNonce = networkNonce;
            this.setNonce(networkNonce)
          }
          if (this.option && this.option.beforeCommit) {
            await this.setLastUsageTime(Date.now());
            await this.setNonce(useNonce + 1);
          }
          // Resolve with nonce details and functions to submit and rollback
          resolve({
            nonce: useNonce,
            networkNonce,
            localNonce,
            submit: async () => {
              if (!this.option || !this.option.beforeCommit) {
                await this.setLastUsageTime(Date.now());
                await this.setNonce(useNonce + 1);
              }
              release();
            },
            rollback: async () => {
              await this.setNonce(useNonce);
              release();
            },
          });
        } catch (error) {
          // Release mutex and propagate error
          release();
          reject(error);
        }
      } catch (error) {
        // Propagate error
        reject(error);
      }
    });
  }
}
