import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SettingsService {
  constructor(private prisma: PrismaService) {}

  async getUserSettings(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        cats: true,
      },
    });

    if (!user) {
      return null; 
    }

    const { password, ...userWithoutPassword } = user;

    return {
      user: userWithoutPassword,
    };
  }
}