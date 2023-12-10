import { Injectable } from '@nestjs/common';
import TransactionSource from '../../../models/TransactionSource.model';
import { InjectModel } from '@nestjs/sequelize';

@Injectable()
export class ReportService {
    constructor(@InjectModel(TransactionSource, 'stats') private readonly transactionSource: typeof TransactionSource) { }

    async reportTransaction(chainId: string, hash: string, channel: string, description: string) {
        try {
            // Find or create a transaction with the provided hash
            const [transaction, created] = await this.transactionSource.findOrCreate({
                where: { hash }, // Search for an existing record with the given hash
                defaults: {
                    chainId,
                    hash,
                    channel,
                    description,
                    created_at: new Date(),
                    updated_at: new Date(),
                },
            });

            // If the transaction was created, it means no existing record was found
            if (created) {
                console.log('New transaction created:', transaction.toJSON());
            } else {
                console.log('Transaction already exists:', transaction.toJSON());
            }

            // You can return additional information or the created transaction
            return { transaction, created };
        } catch (error) {
            // Handle errors appropriately
            console.error('Error reporting transaction:', error);
            throw new Error('Failed to report transaction');
        }
    }
}
