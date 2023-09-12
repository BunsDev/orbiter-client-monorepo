import { Module } from '@nestjs/common';
import { V2Module } from "./v2/v2.module";
import { V3Module } from "./v3/v3.module";

@Module({
  imports: [V2Module,V3Module],
  controllers: [],
  providers: [],
})
export class ApiModule {
}

