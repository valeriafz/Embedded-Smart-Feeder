import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import * as mqtt from 'mqtt';

@Injectable()
export class MqttService implements OnModuleInit, OnModuleDestroy {
  private client: mqtt.MqttClient;
  private readonly logger = new Logger(MqttService.name);

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

      // Subscribe to device status topics
      this.client.subscribe('pet-feeder/+/status', (err) => {
        if (err) {
          this.logger.error('Failed to subscribe to status topics', err);
        }
      });

      // Subscribe to feeding confirmation
      this.client.subscribe('pet-feeder/+/feeding/response', (err) => {
        if (err) {
          this.logger.error(
            'Failed to subscribe to feeding response topics',
            err,
          );
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
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.endAsync();
    }
  }

  /// Update dispenseFeed to include catId in payload
  async dispenseFeed(
    deviceId: string,
    catId: string,
    amount: number = 1,
  ): Promise<boolean> {
    try {
      const topic = `pet-feeder/${deviceId}/commands/feed`;
      const payload = JSON.stringify({
        action: 'dispense',
        catId, // <-- add catId here
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
      const topic = `pet-feeder/${deviceId}/commands/schedule`;
      const payload = JSON.stringify({
        action: 'schedule',
        catId,
        schedule,
        timestamp: new Date().toISOString(),
      });

      await this.client.publishAsync(topic, payload, { qos: 1 });
      this.logger.log(
        `Schedule command sent to device ${deviceId} for cat ${catId}`,
      );
      return true;
    } catch (error) {
      this.logger.error(
        `Failed to send schedule command to device ${deviceId} for cat ${catId}:`,
        error,
      );
      return false;
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

  private handleIncomingMessage(topic: string, message: string) {
    try {
      const parsedMessage = JSON.parse(message);
      this.logger.log(`Received message on topic ${topic}:`, parsedMessage);

      if (topic.includes('/status')) {
        this.handleDeviceStatus(topic, parsedMessage);
      } else if (topic.includes('/feeding/response')) {
        this.handleFeedingResponse(topic, parsedMessage);
      }
    } catch (error) {
      this.logger.error(`Failed to parse message from topic ${topic}:`, error);
    }
  }

  private handleDeviceStatus(topic: string, message: any) {
    // Extract device ID from topic
    const deviceId = topic.split('/')[1];
    this.logger.log(`Device ${deviceId} status:`, message);

    // Here you could update database with device status
    // or emit events for real-time updates to frontend
  }

  private handleFeedingResponse(topic: string, message: any) {
    // Extract device ID from topic
    const deviceId = topic.split('/')[1];
    this.logger.log(`Feeding response from device ${deviceId}:`, message);

    // Here you could update feeding logs in database
    // or send notifications to user
  }

  // Utility method to check if client is connected
  isConnected(): boolean {
    return this.client && this.client.connected;
  }
}
