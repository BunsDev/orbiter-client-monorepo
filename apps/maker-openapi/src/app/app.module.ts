import { Module } from '@nestjs/common';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { OrbiterConfigModule } from '@orbiter-finance/config';
import { ConsulModule } from '@orbiter-finance/consul';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ConsulModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        return {
          name: 'maker-openapi',
          url:config.get("CONSUL_URL")
        };
      },
    }),
    OrbiterConfigModule.forRoot({
      chainConfigPath: "explore-server/chains.json",
      envConfigPath: "explore-server/config.yaml",
    }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
