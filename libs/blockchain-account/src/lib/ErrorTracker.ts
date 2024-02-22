export class ErrorTracker {
    private errorCounts: Map<string, { count: number, timestamp: number }> = new Map();
    private operationAvailable: boolean = true;

    constructor(private errorThreshold: number, private windowSize: number = 1000 * 60, private recoveryTime: number = 1000 * 60 * 2) {
    }

    trackError(errorMsg: string) {
        if (!this.operationAvailable) {
            console.log('Current status is unavailable', this.errorCounts.get(errorMsg));
            return; // If operation is not available, return directly
        }

        // Initialize error count and timestamp for the specific error message
        if (!this.errorCounts.has(errorMsg)) {
            this.errorCounts.set(errorMsg, { count: 0, timestamp: Date.now() });
        }

        // Update error count and timestamp for the specific error message
        const errorInfo = this.errorCounts.get(errorMsg)!;
        errorInfo.count++;
        const now = Date.now();
        // If the current time exceeds the time window, reset the count and timestamp
        if (now - errorInfo.timestamp > this.windowSize) {
            errorInfo.count = 1;
            errorInfo.timestamp = now;
        }

        // If the error count exceeds the threshold within the time window, mark the operation as unavailable
        if (errorInfo.count >= this.errorThreshold) {
            console.error(`Error "${errorMsg}" occurred ${errorInfo.count} times in the last ${this.windowSize / 1000} seconds, exceeding threshold.`);
            this.operationAvailable = false; // Mark operation as not available
            // Restore the operation after the recovery time
            setTimeout(() => {
                this.markOperationAvailable();
            }, this.recoveryTime);
        }
    }

    markOperationAvailable() {
        this.operationAvailable = true;
        this.errorCounts.clear(); // Clear error records
    }

    isOperationAvailable(): boolean {
        return this.operationAvailable;
    }
}
