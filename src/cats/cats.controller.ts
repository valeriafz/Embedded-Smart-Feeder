import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Delete,
  UseGuards,
  Request,
  UseInterceptors,
  UploadedFile,
  ParseIntPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CatsService } from './cats.service';
import { CreateCatDto } from './dto/create-cat.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UpdateCatDto } from './dto/update-cat.dto';

@Controller('cats')
@UseGuards(JwtAuthGuard)
export class CatsController {
  constructor(private readonly catsService: CatsService) {}

  @Post()
  create(@Body() createCatDto: CreateCatDto, @Request() req) {
    return this.catsService.create(createCatDto, req.user.id);
  }

  @Get()
  findAll(@Request() req) {
    return this.catsService.findAllByUser(req.user.id);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @Request() req) {
    return this.catsService.findOne(id, req.user.id);
  }

  @Post(':id/image')
  @UseInterceptors(FileInterceptor('image'))
  uploadImage(
    @Param('id', ParseIntPipe) id: number,
    @Request() req,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.catsService.uploadImage(id, req.user.id, file);
  }

  @Put(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateCatDto: UpdateCatDto,
    @Request() req,
  ) {
    return this.catsService.update(id, req.user.id, updateCatDto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @Request() req) {
    return this.catsService.remove(id, req.user.id);
  }
}
