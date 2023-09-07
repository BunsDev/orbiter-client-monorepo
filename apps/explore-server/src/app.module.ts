import { Module } from '@nestjs/common';
import { RpcScanningModule } from './rpc-scanning/rpc-scanning.module';
import { EvmBlockscoutScanningModule } from './evm-blockscout-scanning/evm-blockscout-scanning.module';
import { EvmEtherscanScanningModule } from './evm-etherscan-scanning/evm-etherscan-scanning.module';
import { ApiModule } from './api/api.module';
import { ThegraphModule } from './thegraph/thegraph.module';
import { TransactionModule } from './transaction/transaction.module';

import { WinstonModule } from 'nest-winston';
import { ApiScanningModule } from './api-scanning/api-scanning.module';
import * as winston from 'winston';

import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import { GlobalModule } from './global/global.module';
import { RabbitMqModule } from './rabbit-mq/rabbit-mq.module';
import { AlertModule } from '@orbiter-finance/alert';

dayjs.extend(utc);

@Module({
  imports: [
    GlobalModule,
    AlertModule,
    WinstonModule.forRoot({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp({
          format: 'YYYY-MM-DD HH:mm:ss',
        }),
        winston.format.json(),
      ),
      transports: [
        new winston.transports.Console({
          level: 'debug',
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple(),
          ),
        }),
      ],
    }),
    ThegraphModule,
    EvmBlockscoutScanningModule,
    EvmEtherscanScanningModule,
    ApiModule,
    TransactionModule,
    RpcScanningModule,
    ApiScanningModule,
    RabbitMqModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
