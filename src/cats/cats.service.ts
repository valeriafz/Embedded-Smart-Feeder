import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCatDto } from './dto/create-cat.dto';
import { CloudinaryService } from '../cloudinary/cloudinary.service';

@Injectable()
export class CatsService {
  constructor(
    private prisma: PrismaService,
    private cloudinaryService: CloudinaryService,
  ) {}

  async create(createCatDto: CreateCatDto, userId: number) {
    return this.prisma.cat.create({
      data: {
        ...createCatDto,
        userId,
      },
    });
  }

  async findAllByUser(userId: number) {
    return this.prisma.cat.findMany({
      where: { userId },
    });
  }

  async findOne(id: number, userId: number) {
    const cat = await this.prisma.cat.findFirst({
      where: { 
        id,
        userId,
      },
    });

    if (!cat) {
      throw new NotFoundException(`Cat with ID ${id} not found`);
    }

    return cat;
  }

  async uploadImage(id: number, userId: number, file: Express.Multer.File) {
    // First check if cat exists and belongs to user
    await this.findOne(id, userId);

    // Upload image to Cloudinary
    const result = await this.cloudinaryService.uploadImage(file);

    // Update cat with image URL
    return this.prisma.cat.update({
      where: { id },
      data: { imageUrl: result.secure_url },
    });
  }

  async remove(id: number, userId: number) {
    // First check if cat exists and belongs to user
    await this.findOne(id, userId);

    return this.prisma.cat.delete({
      where: { id },
    });
  }
}
