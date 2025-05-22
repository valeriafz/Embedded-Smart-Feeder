import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { PrismaModule } from './prisma/prisma.module';
import { CatsModule } from './cats/cats.module';
import { CloudinaryModule } from './cloudinary/cloudinary.module';
import { SettingsModule } from './settings/settings.module';
import { MulterModule } from '@nestjs/platform-express';
import { MqttService } from './pet-feeder/pet-feeder.service';
import { PetFeederController } from './pet-feeder/pet-feeder.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
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
  controllers: [PetFeederController],
  providers: [MqttService],
  exports: [MqttService],
})
export class AppModule {}
