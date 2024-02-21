export class ErrorTracker {
    private errorCounts: Map<string, number> = new Map();
    private errorThreshold: number;
    private operationAvailable: boolean = true;
    private recoveryTime: number = 300000; // Default recovery time is 5 minutes

    constructor(threshold: number, recoveryTime: number = 1000 * 60 * 2) {
        this.errorThreshold = threshold;
        this.recoveryTime = recoveryTime;
    }

    trackError(errorMsg: string) {
        if (!this.operationAvailable) {
            return; // If operation is not available, return directly
        }
        // Update error count for the specific error message
        if (this.errorCounts.has(errorMsg)) {
            this.errorCounts.set(errorMsg, this.errorCounts.get(errorMsg)! + 1);
        } else {
            this.errorCounts.set(errorMsg, 1);
        }

        // Check if the total error count exceeds the threshold in the time window
        const errorCountInWindow = this.errorCounts.get(errorMsg);
        if (errorCountInWindow > this.errorThreshold) {
            console.error(`Error "${errorMsg}" occurred ${errorCountInWindow} times in the last exceeding threshold.`);
            // this.operationAvailable = false; // Mark operation as not available
            // You can perform other actions here, such as sending notifications
            setTimeout(() => {
                this.markOperationAvailable(); // Restore operation after recovery time
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
