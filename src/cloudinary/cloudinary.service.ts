import { Injectable } from '@nestjs/common';
import { CloudinaryConfig } from './cloudinary-config';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class CloudinaryService {
  private cloudinary = CloudinaryConfig();

  async uploadImage(file: Express.Multer.File) {
    return new Promise<any>((resolve, reject) => {
      const uploadStream = this.cloudinary.uploader.upload_stream(
        {
          folder: 'cat-app',
          public_id: `cat-${uuidv4()}`,
        },
        (error, result) => {
          if (error) {
            reject(error);
          } else {
            resolve(result);
          }
        },
      );

      uploadStream.write(file.buffer);
      uploadStream.end();
    });
  }
}
