import {
  Controller,
  Post,
  Param,
  Body,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { MqttService } from './pet-feeder.service';
import { PrismaService } from '../prisma/prisma.service';

interface FeedRequest {
  amount?: number;
}

interface ScheduleRequest {
  time: string;
  amount: number;
}

@Controller('pet-feeder')
export class PetFeederController {
  constructor(
    private readonly mqttService: MqttService,
    private readonly prisma: PrismaService,
  ) {}

  @Post(':deviceId/cats/:catId/feed')
  async feedCat(
    @Param('deviceId') deviceId: string,
    @Param('catId') catId: string,
    @Body() feedRequest: FeedRequest = {},
  ) {
    try {
      if (!deviceId || !catId) {
        throw new HttpException(
          'Device ID and Cat ID are required',
          HttpStatus.BAD_REQUEST,
        );
      }

      if (!this.mqttService.isConnected()) {
        throw new HttpException(
          'MQTT service not connected',
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }

      const amount = feedRequest.amount || 100;

      const success = await this.mqttService.dispenseFeed(
        deviceId,
        catId,
        amount,
      );

      if (!success) {
        throw new HttpException(
          'Failed to send feed command',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      return {
        success: true,
        message: `Feed command sent to device ${deviceId} for cat ${catId}`,
        amount,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        'Internal server error',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post(':deviceId/cats/:catId/schedule')
  async scheduleFeedCat(
    @Param('deviceId') deviceId: string,
    @Param('catId') catId: string,
    @Body() scheduleRequest: ScheduleRequest,
  ) {
    try {
      if (!deviceId || !catId) {
        throw new HttpException(
          'Device ID and Cat ID are required',
          HttpStatus.BAD_REQUEST,
        );
      }

      if (!scheduleRequest.time || !scheduleRequest.amount) {
        throw new HttpException(
          'Time and amount are required',
          HttpStatus.BAD_REQUEST,
        );
      }

      if (!this.mqttService.isConnected()) {
        throw new HttpException(
          'MQTT service not connected',
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }

      const success = await this.mqttService.scheduleFeeding(
        deviceId,
        catId,
        scheduleRequest,
      );

      if (!success) {
        throw new HttpException(
          'Failed to send schedule command',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      return {
        success: true,
        message: `Schedule command sent to device ${deviceId} for cat ${catId}`,
        schedule: scheduleRequest,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        'Internal server error',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post(':deviceId/cats/:catId/sendImage')
  async sendImageCommand(
    @Param('deviceId') deviceId: string,
    @Param('catId') catId: string,
  ) {
    try {
      if (!deviceId || !catId) {
        throw new HttpException(
          'Device ID and Cat ID are required',
          HttpStatus.BAD_REQUEST,
        );
      }

      if (!this.mqttService.isConnected()) {
        throw new HttpException(
          'MQTT service not connected',
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }

      const success = await this.mqttService.sendImage(deviceId, catId);

      if (!success) {
        throw new HttpException(
          'Failed to send image command',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      return {
        success: true,
        message: `Send image command sent to device ${deviceId} for cat ${catId}`,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        'Internal server error',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
