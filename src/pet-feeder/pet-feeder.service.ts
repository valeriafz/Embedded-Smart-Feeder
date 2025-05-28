import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import * as mqtt from 'mqtt';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MqttService implements OnModuleInit, OnModuleDestroy {
  private client: mqtt.MqttClient;
  private readonly logger = new Logger(MqttService.name);
  private scheduledJobs = new Map<string, NodeJS.Timeout>();
  private deviceWeights = new Map<
    string,
    { weight: number; timestamp: Date }
  >();

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    const brokerUrl = process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883';
    this.logger.log(`Connecting to MQTT broker at: ${brokerUrl}`);

    this.client = mqtt.connect(brokerUrl, {
      clientId: `pet-feeder-backend-${Math.random().toString(16).slice(3)}`,
      username: process.env.MQTT_USERNAME,
      password: process.env.MQTT_PASSWORD,
      keepalive: 60,
      reconnectPeriod: 1000,
    });

    this.client.on('connect', () => {
      this.logger.log(`Connected to MQTT broker ${brokerUrl}`);

      this.client.subscribe('pet-feeder/#', (err) => {
        if (err) {
          this.logger.error('Failed to subscribe to pet-feeder topics', err);
        } else {
          this.logger.log('Successfully subscribed to pet-feeder/# topics');
        }
      });
    });

    this.client.on('message', (topic, message) => {
      this.handleIncomingMessage(topic, message.toString());
    });

    this.client.on('error', (error) => {
      this.logger.error('MQTT connection error:', error);
    });

    this.client.on('reconnect', () => {
      this.logger.log('Reconnecting to MQTT broker...');
    });

    await this.initializeSchedules();
  }

  async onModuleDestroy() {
    this.scheduledJobs.forEach((timeout) => clearTimeout(timeout));
    this.scheduledJobs.clear();

    if (this.client) {
      await this.client.endAsync();
    }
  }

  getDeviceWeight(
    deviceId: string,
  ): { weight: number; timestamp: Date } | null {
    return this.deviceWeights.get(deviceId) || null;
  }

  async dispenseFeed(
    deviceId: string,
    catId: string,
    amount: number = 100,
  ): Promise<boolean> {
    try {
      const topic = `pet-feeder/${deviceId}/commands/feed`;
      const payload = JSON.stringify({
        action: 'dispense',
        catId,
        amount,
        timestamp: new Date().toISOString(),
      });

      await this.client.publishAsync(topic, payload, { qos: 1 });
      this.logger.log(
        `Feed command sent to device ${deviceId} for cat ${catId}`,
      );
      return true;
    } catch (error) {
      this.logger.error(
        `Failed to send feed command to device ${deviceId} for cat ${catId}:`,
        error,
      );
      return false;
    }
  }

  async scheduleFeeding(
    deviceId: string,
    catId: string,
    schedule: { time: string; amount: number },
  ): Promise<boolean> {
    try {
      const scheduleKey = `${deviceId}-${catId}-${schedule.time}`;

      if (this.scheduledJobs.has(scheduleKey)) {
        clearTimeout(this.scheduledJobs.get(scheduleKey));
        this.scheduledJobs.delete(scheduleKey);
      }

      this.scheduleNextFeeding(deviceId, catId, schedule.time, schedule.amount);

      this.logger.log(
        `Feeding scheduled for device ${deviceId}, cat ${catId} at ${schedule.time}`,
      );
      return true;
    } catch (error) {
      this.logger.error(
        `Failed to schedule feeding for device ${deviceId} cat ${catId}:`,
        error,
      );
      return false;
    }
  }

  async cancelSchedule(
    deviceId: string,
    catId: string,
    time: string,
  ): Promise<boolean> {
    try {
      const scheduleKey = `${deviceId}-${catId}-${time}`;

      if (this.scheduledJobs.has(scheduleKey)) {
        clearTimeout(this.scheduledJobs.get(scheduleKey));
        this.scheduledJobs.delete(scheduleKey);
        this.logger.log(`Cancelled schedule for ${scheduleKey}`);
        return true;
      }

      return false;
    } catch (error) {
      this.logger.error(
        `Failed to cancel schedule for ${deviceId}-${catId}-${time}:`,
        error,
      );
      return false;
    }
  }

  private scheduleNextFeeding(
    deviceId: string,
    catId: string,
    time: string,
    amount: number,
  ) {
    const scheduleKey = `${deviceId}-${catId}-${time}`;
    const nextFeedingTime = this.getNextFeedingTime(time);
    const msUntilFeeding = nextFeedingTime.getTime() - Date.now();

    if (msUntilFeeding <= 0) {
      const tomorrow = new Date(nextFeedingTime);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const msUntilTomorrow = tomorrow.getTime() - Date.now();

      const timeout = setTimeout(async () => {
        await this.executeScheduledFeeding(deviceId, catId, amount);
        // Reschedule for the next day
        this.scheduleNextFeeding(deviceId, catId, time, amount);
      }, msUntilTomorrow);

      this.scheduledJobs.set(scheduleKey, timeout);
      this.logger.log(
        `Scheduled feeding for ${scheduleKey} in ${Math.round(msUntilTomorrow / 1000 / 60)} minutes`,
      );
    } else {
      const timeout = setTimeout(async () => {
        await this.executeScheduledFeeding(deviceId, catId, amount);
        // Reschedule for the next day
        this.scheduleNextFeeding(deviceId, catId, time, amount);
      }, msUntilFeeding);

      this.scheduledJobs.set(scheduleKey, timeout);
      this.logger.log(
        `Scheduled feeding for ${scheduleKey} in ${Math.round(msUntilFeeding / 1000 / 60)} minutes`,
      );
    }
  }

  private getNextFeedingTime(time: string): Date {
    // Parse time in HH:mm format
    const [hours, minutes] = time.split(':').map((num) => parseInt(num, 10));

    const now = new Date();
    const bucharestTime = new Date(
      now.toLocaleString('en-US', { timeZone: 'Europe/Bucharest' }),
    );

    const feedingTime = new Date(bucharestTime);
    feedingTime.setHours(hours, minutes, 0, 0);

    // If the time has already passed today, schedule for tomorrow
    if (feedingTime <= bucharestTime) {
      feedingTime.setDate(feedingTime.getDate() + 1);
    }

    return feedingTime;
  }

  private async executeScheduledFeeding(
    deviceId: string,
    catId: string,
    amount: number,
  ) {
    try {
      this.logger.log(
        `Executing scheduled feeding for device ${deviceId}, cat ${catId}, amount ${amount}`,
      );

      // Check if the schedule is still active in the database
      const schedule = await this.prisma.feedingSchedule.findFirst({
        where: {
          catId: parseInt(catId),
          deviceId,
          isActive: true,
        },
      });

      if (!schedule) {
        this.logger.log(
          `Schedule no longer active for device ${deviceId}, cat ${catId}`,
        );
        return;
      }

      const success = await this.dispenseFeed(deviceId, catId, amount);

      if (success) {
        await this.prisma.feedingHistory.create({
          data: {
            catId: parseInt(catId),
            deviceId,
            amount,
            timestamp: new Date(),
          },
        });

        // Clean up old feeding history (older than 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        await this.prisma.feedingHistory.deleteMany({
          where: {
            timestamp: {
              lt: thirtyDaysAgo,
            },
          },
        });

        this.logger.log(
          `Scheduled feeding executed successfully for device ${deviceId}, cat ${catId}`,
        );
      } else {
        this.logger.error(
          `Failed to execute scheduled feeding for device ${deviceId}, cat ${catId}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Error executing scheduled feeding for device ${deviceId}, cat ${catId}:`,
        error,
      );
    }
  }

  private async initializeSchedules() {
    try {
      const activeSchedules = await this.prisma.feedingSchedule.findMany({
        where: { isActive: true },
      });

      for (const schedule of activeSchedules) {
        this.scheduleNextFeeding(
          schedule.deviceId,
          schedule.catId.toString(),
          schedule.time,
          schedule.amount,
        );
      }

      this.logger.log(
        `Initialized ${activeSchedules.length} active feeding schedules`,
      );
    } catch (error) {
      this.logger.error('Failed to initialize schedules:', error);
    }
  }

  // Updated MqttService method - no deviceId needed
  async toggleCatSchedules(
    catId: number,
    isActive: boolean,
  ): Promise<{ success: boolean; affectedCount: number; message: string }> {
    try {
      // Get all schedules for this cat (across all devices)
      const schedules = await this.prisma.feedingSchedule.findMany({
        where: {
          catId,
        },
      });

      if (schedules.length === 0) {
        return {
          success: false,
          affectedCount: 0,
          message: 'No schedules found for this cat',
        };
      }

      // Update all schedules for this cat
      const updateResult = await this.prisma.feedingSchedule.updateMany({
        where: {
          catId,
        },
        data: { isActive },
      });

      // Handle the scheduled jobs
      for (const schedule of schedules) {
        const scheduleKey = `${schedule.deviceId}-${schedule.catId}-${schedule.time}`;

        if (isActive) {
          // Activating - start the job
          this.scheduleNextFeeding(
            schedule.deviceId,
            schedule.catId.toString(),
            schedule.time,
            schedule.amount,
          );
        } else {
          // Deactivating - cancel the job
          if (this.scheduledJobs.has(scheduleKey)) {
            clearTimeout(this.scheduledJobs.get(scheduleKey));
            this.scheduledJobs.delete(scheduleKey);
          }
        }
      }

      this.logger.log(
        `${isActive ? 'Activated' : 'Deactivated'} ${updateResult.count} schedules for cat ${catId}`,
      );

      return {
        success: true,
        affectedCount: updateResult.count,
        message: `${updateResult.count} schedule(s) ${isActive ? 'activated' : 'deactivated'} successfully`,
      };
    } catch (error) {
      this.logger.error(`Failed to toggle schedules for cat ${catId}:`, error);
      return {
        success: false,
        affectedCount: 0,
        message: 'Failed to toggle schedules',
      };
    }
  }

  async requestDeviceStatus(deviceId: string): Promise<boolean> {
    try {
      const topic = `pet-feeder/${deviceId}/commands/status`;
      const payload = JSON.stringify({
        action: 'get_status',
        timestamp: new Date().toISOString(),
      });

      await this.client.publishAsync(topic, payload, { qos: 1 });
      return true;
    } catch (error) {
      this.logger.error(
        `Failed to request status from device ${deviceId}:`,
        error,
      );
      return false;
    }
  }

  async sendImage(deviceId: string, catId: string): Promise<boolean> {
    try {
      const topic = `pet-feeder/${deviceId}/commands/sendImage`;
      const payload = JSON.stringify({
        action: 'sendImage',
        catId,
        timestamp: new Date().toISOString(),
      });

      await this.client.publishAsync(topic, payload, { qos: 1 });
      this.logger.log(
        `Sending image command sent to device ${deviceId} for cat ${catId}`,
      );
      return true;
    } catch (error) {
      this.logger.error(
        `Failed to send image command to device ${deviceId} for cat ${catId}:`,
        error,
      );
      return false;
    }
  }

  async trainModel(deviceId: string): Promise<boolean> {
    try {
      const topic = `pet-feeder/${deviceId}/commands/info`;
      const payload = JSON.stringify({
        action: 'trainModel',
        timestamp: new Date().toISOString(),
      });

      await this.client.publishAsync(topic, payload, { qos: 1 });
      this.logger.log(`Successfull train model sent to device ${deviceId}`);
      return true;
    } catch (error) {
      this.logger.error(
        `Failed to send train model to device ${deviceId}`,
        error,
      );
      return false;
    }
  }

  private async handleCatDetection(deviceId: string, message: any) {
    try {
      const { catId, timestamp } = message;

      if (!catId || !timestamp) {
        this.logger.warn(
          `Invalid cat detection message from device ${deviceId}:`,
          message,
        );
        return;
      }

      // Convert timestamp to Bucharest timezone
      const detectionTime = new Date(timestamp);
      const bucharestTime = new Date(
        detectionTime.toLocaleString('en-US', { timeZone: 'Europe/Bucharest' }),
      );

      // Format current time as HH:MM
      const currentTimeString = bucharestTime.toTimeString().slice(0, 5); // Gets HH:MM format

      this.logger.log(
        `Cat ${catId} detected at device ${deviceId} at ${currentTimeString}`,
      );

      // Check if cat has ANY active schedule for this device
      const activeSchedules = await this.prisma.feedingSchedule.findMany({
        where: {
          catId: parseInt(catId),
          deviceId,
          isActive: true,
        },
      });

      if (activeSchedules.length > 0) {
        // Cat has active schedules - check if it's specifically scheduled for this time
        const scheduledNow = activeSchedules.some(
          (schedule) => schedule.time === currentTimeString,
        );

        if (scheduledNow) {
          this.logger.log(
            `Cat ${catId} is on schedule at ${currentTimeString} - no action needed`,
          );
        } else {
          this.logger.log(
            `Cat ${catId} has active schedules but not for ${currentTimeString} - no action needed`,
          );
        }
        return; // Don't dispense if cat has any active schedule
      }

      // Cat has no active schedules at all - dispense food
      this.logger.log(`Cat ${catId} has no active schedules - dispensing food`);

      const success = await this.dispenseFeed(deviceId, catId, 100);

      if (success) {
        // Record the feeding in history
        await this.prisma.feedingHistory.create({
          data: {
            catId: parseInt(catId),
            deviceId,
            amount: 100,
            timestamp: new Date(),
          },
        });

        this.logger.log(
          `Successfully dispensed food for cat ${catId} at device ${deviceId}`,
        );
      } else {
        this.logger.error(
          `Failed to dispense food for cat ${catId} at device ${deviceId}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Error handling cat detection for device ${deviceId}:`,
        error,
      );
    }
  }

  private handleIncomingMessage(topic: string, message: string) {
    try {
      const payload = JSON.parse(message);
      const deviceId = topic.split('/')[1];
      this.logger.log(`Info message from device ${deviceId}:`, payload);

      // Handle weight updates
      if (payload.action === 'sendWeight' && payload.weight) {
        const weight = parseFloat(payload.weight);
        this.deviceWeights.set(deviceId, {
          weight: weight,
          timestamp: new Date(payload.timestamp || new Date()),
        });

        this.logger.log(`Received weight for device ${deviceId}: ${weight}`);
      }

      if (payload.action === 'sendCat') {
        this.handleCatDetection(deviceId, payload);
      }
    } catch (error) {
      this.logger.error(`Error processing message from topic ${topic}:`, error);
    }
  }

  // Utility method to check if client is connected
  isConnected(): boolean {
    return this.client && this.client.connected;
  }
}
