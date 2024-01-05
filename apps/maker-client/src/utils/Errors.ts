export class InsufficientLiquidity extends Error {
    constructor(message?: string) {
        super(message);
        this.name = 'InsufficientLiquidity';
    }
}

export class AlreadyPaid extends Error {
    constructor(message: string = 'AlreadyPaid') {
        super(message);
        this.name = 'AlreadyPaid';
    }
}
export class RepeatConsumptionError extends Error {
    constructor(message?: string) {
        super(message);
        this.name = 'RepeatConsumptionError';
    }
}
export class MakerNotPrivetKey extends Error {
    constructor(message: string = 'No wallet exists for private key') {
        super(message);
        this.name = 'MakerNotPrivetKey';
    }
}
export class MakerDisabledPaid extends Error {
    constructor(message: string = 'Maker has not enabled refunds') {
        super(message);
        this.name = 'MakerDisabledPaid';
    }
}
export class MakerPaidTimeExceeded extends Error {
    constructor(message: string = 'Maker payment time exceeded') {
        super(message);
        this.name = 'MakerPaidTimeExceeded';
    }
}
export class AmountRiskControlError extends Error {
    constructor(message: string = 'Amount risk control error') {
        super(message);
        this.name = 'AmountRiskControlError';
    }
}
export class PaidRollbackError extends Error {
    constructor(message: string = 'PaidRollbackError') {
        super(message);
        this.name = 'PaidRollbackError';
    }
}
export class BatchPaidSameMaker extends Error {
    constructor(message: string = 'The transactions in the batch refund are not from the same Maker') {
        super(message);
        this.name = 'BatchPaidSameMaker';
    }
}


export class PaidSourceTimeLessStartupTime extends Error {
    constructor(message: string = 'Source chain transaction time is less than startup time') {
        super(message);
        this.name = 'PaidSourceTimeLessStartupTime';
    }
}
export class PaidBeforeCheck extends Error {
    constructor(message: string = 'Error checking information before sending') {
        super(message);
        this.name = 'PaidBeforeCheck';
    }
}

