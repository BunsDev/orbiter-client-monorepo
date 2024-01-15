import { Injectable, OnModuleInit } from '@nestjs/common';
@Injectable()
export class AppInitializer implements OnModuleInit {
  onModuleInit() {
    console.log('NestJS application is initializing...');
  }
}
