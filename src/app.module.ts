import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { PrismaModule } from './prisma/prisma.module';
import { CatsModule } from './cats/cats.module';
import { CloudinaryModule } from './cloudinary/cloudinary.module';
import { SettingsModule } from './settings/settings.module';
import { MulterModule } from '@nestjs/platform-express';

@Module({
  imports: [
    AuthModule, 
    UsersModule, 
    PrismaModule, 
    CatsModule, 
    CloudinaryModule, 
    SettingsModule,
    MulterModule.register({
      dest: './uploads',
    }),
  ],
})
export class AppModule {}