import { Injectable, OnModuleInit } from '@nestjs/common';
@Injectable()
export class AppInitializer implements OnModuleInit {
  onModuleInit() {
    // 在这里执行初始化操作，例如数据库连接、环境变量设置等
    console.log('NestJS application is initializing...');
  }
}
