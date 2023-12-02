import { Module } from '@nestjs/common';
import { TransactionController } from './transaction.controller';
import { TransactionService } from './transaction.service';
import { PrometheusModule } from "@willsoto/nestjs-prometheus";

@Module({
  imports: [
    // PrometheusModule.register({
    //   // path: "/transaction/metrics",
    //   controller: TransactionController,
    //   defaultMetrics: {
    //     enabled: false,
    //   },
    // }),
  ],
  controllers: [],
  providers: [TransactionService]
})
export class TransactionModule {}
