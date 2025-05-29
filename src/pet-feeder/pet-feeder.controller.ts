import {
  Controller,
  Post,
  Get,
  Param,
  Patch,
  BadRequestException,
  Body,
  HttpException,
  HttpStatus,
  Query,
} from '@nestjs/common';
import { IsBoolean } from 'class-validator';
import { MqttService } from './pet-feeder.service';
import { PrismaService } from '../prisma/prisma.service';

class ToggleCatSchedulesDto {
  @IsBoolean()
  isActive: boolean;
}

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

  @Get(':deviceId/weight')
  async getDeviceWeight(@Param('deviceId') deviceId: string) {
    try {
      const weightData = this.mqttService.getDeviceWeight(deviceId);

      if (!weightData) {
        throw new HttpException(
          `No weight data available for device ${deviceId}`,
          HttpStatus.NOT_FOUND,
        );
      }

      return {
        deviceId,
        weight: weightData.weight,
        timestamp: weightData.timestamp,
        unit: 'grams',
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        'Internal server error',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

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

      const cat = await this.prisma.cat.findUnique({
        where: { id: parseInt(catId) },
      });

      if (!cat) {
        throw new HttpException('Cat not found', HttpStatus.NOT_FOUND);
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

      await this.prisma.feedingHistory.create({
        data: {
          catId: parseInt(catId),
          deviceId,
          amount,
          timestamp: new Date(),
        },
      });

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      await this.prisma.feedingHistory.deleteMany({
        where: {
          timestamp: {
            lt: thirtyDaysAgo,
          },
        },
      });

      return {
        success: true,
        message: `Feed command sent to device ${deviceId} for cat ${cat.name}`,
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

      // Validate time format (HH:mm)
      const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
      if (!timeRegex.test(scheduleRequest.time)) {
        throw new HttpException(
          'Invalid time format. Use HH:mm (e.g., 08:30)',
          HttpStatus.BAD_REQUEST,
        );
      }

      const cat = await this.prisma.cat.findUnique({
        where: { id: parseInt(catId) },
      });

      if (!cat) {
        throw new HttpException('Cat not found', HttpStatus.NOT_FOUND);
      }

      if (!this.mqttService.isConnected()) {
        throw new HttpException(
          'MQTT service not connected',
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }

      // Save or update feeding schedule in database first
      const schedule = await this.prisma.feedingSchedule.upsert({
        where: {
          catId_deviceId_time: {
            catId: parseInt(catId),
            deviceId,
            time: scheduleRequest.time,
          },
        },
        update: {
          amount: scheduleRequest.amount,
          isActive: true,
          updatedAt: new Date(),
        },
        create: {
          catId: parseInt(catId),
          deviceId,
          time: scheduleRequest.time,
          amount: scheduleRequest.amount,
          isActive: true,
        },
      });

      // Now schedule the feeding using the backend scheduler
      const success = await this.mqttService.scheduleFeeding(
        deviceId,
        catId,
        scheduleRequest,
      );

      if (!success) {
        // If scheduling fails, mark the schedule as inactive
        await this.prisma.feedingSchedule.update({
          where: { id: schedule.id },
          data: { isActive: false },
        });

        throw new HttpException(
          'Failed to schedule feeding',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      return {
        success: true,
        message: `Feeding scheduled for device ${deviceId} for cat ${cat.name} at ${scheduleRequest.time} (Bucharest time)`,
        schedule: {
          id: schedule.id,
          time: scheduleRequest.time,
          amount: scheduleRequest.amount,
          deviceId,
          catId: parseInt(catId),
        },
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

  @Post(':deviceId/trainModel')
  async trainModelCommand(@Param('deviceId') deviceId: string) {
    try {
      if (!deviceId) {
        throw new HttpException('Device ID required', HttpStatus.BAD_REQUEST);
      }

      if (!this.mqttService.isConnected()) {
        throw new HttpException(
          'MQTT service not connected',
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }

      await this.mqttService.trainModel(deviceId);

      return {
        success: true,
        message: `Successfull train model sent to device ${deviceId}`,
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

      const cat = await this.prisma.cat.findUnique({
        where: { id: parseInt(catId) },
      });

      if (!cat) {
        throw new HttpException('Cat not found', HttpStatus.NOT_FOUND);
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
        message: `Send image command sent to device ${deviceId} for cat ${cat.name}`,
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

  @Get('cats/:catId/feeding-history')
  async getFeedingHistory(
    @Param('catId') catId: string,
    @Query('days') days?: string,
  ) {
    try {
      const cat = await this.prisma.cat.findUnique({
        where: { id: parseInt(catId) },
      });

      if (!cat) {
        throw new HttpException('Cat not found', HttpStatus.NOT_FOUND);
      }

      const daysToQuery = parseInt(days ?? '30') || 30;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - daysToQuery);

      const feedingHistory = await this.prisma.feedingHistory.findMany({
        where: {
          catId: parseInt(catId),
          timestamp: {
            gte: startDate,
          },
        },
        include: {
          cat: {
            select: {
              name: true,
            },
          },
        },
        orderBy: {
          timestamp: 'desc',
        },
      });

      return {
        success: true,
        catName: cat.name,
        history: feedingHistory.map((entry) => ({
          id: entry.id,
          catId: entry.catId,
          catName: entry.cat.name,
          deviceId: entry.deviceId,
          amount: entry.amount,
          timestamp: entry.timestamp,
        })),
        totalFeedings: feedingHistory.length,
        periodDays: daysToQuery,
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        'Internal server error',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Patch('cats/:catId/toggle')
  async toggleCatSchedules(
    @Param('catId') catId: string,
    @Body() dto: ToggleCatSchedulesDto,
  ) {
    const result = await this.mqttService.toggleCatSchedules(
      parseInt(catId),
      dto.isActive,
    );

    if (!result.success) {
      throw new BadRequestException(result.message);
    }

    return {
      success: true,
      message: result.message,
      affectedCount: result.affectedCount,
      status: dto.isActive ? 'activated' : 'deactivated',
    };
  }

  @Get('cats/:catId/schedules')
  async getFeedingSchedules(@Param('catId') catId: string) {
    try {
      const cat = await this.prisma.cat.findUnique({
        where: { id: parseInt(catId) },
      });

      if (!cat) {
        throw new HttpException('Cat not found', HttpStatus.NOT_FOUND);
      }

      const schedules = await this.prisma.feedingSchedule.findMany({
        where: {
          catId: parseInt(catId),
          isActive: true,
        },
        include: {
          cat: {
            select: {
              name: true,
            },
          },
        },
        orderBy: {
          time: 'asc',
        },
      });

      return {
        success: true,
        catName: cat.name,
        schedules: schedules.map((schedule) => ({
          id: schedule.id,
          catId: schedule.catId,
          catName: schedule.cat.name,
          deviceId: schedule.deviceId,
          time: schedule.time,
          amount: schedule.amount,
          createdAt: schedule.createdAt,
          updatedAt: schedule.updatedAt,
        })),
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        'Internal server error',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('schedules/:scheduleId/delete')
  async deleteFeedingSchedule(@Param('scheduleId') scheduleId: string) {
    try {
      const schedule = await this.prisma.feedingSchedule.findUnique({
        where: { id: parseInt(scheduleId) },
      });

      if (!schedule) {
        throw new HttpException('Schedule not found', HttpStatus.NOT_FOUND);
      }

      // Cancel the scheduled job in the MQTT service
      await this.mqttService.cancelSchedule(
        schedule.deviceId,
        schedule.catId.toString(),
        schedule.time,
      );

      // Mark schedule as inactive in database
      await this.prisma.feedingSchedule.update({
        where: { id: parseInt(scheduleId) },
        data: { isActive: false },
      });

      return {
        success: true,
        message: 'Feeding schedule deleted successfully',
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
