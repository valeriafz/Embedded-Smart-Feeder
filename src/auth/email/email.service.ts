import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import * as fs from 'fs/promises';
import * as path from 'path';

@Injectable()
export class EmailService {
  private transporter: nodemailer.Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD,
      },
      tls: {
        rejectUnauthorized: false,
      },
    });
  }

  async sendWelcomeEmail(userEmail: string): Promise<void> {
    try {
      const templatePath = path.join(
        process.cwd(),
        'src',
        'templates',
        'welcome-home.html',
      );
      let html = await fs.readFile(templatePath, 'utf-8');

      const replacements = {
        userName: userEmail.split('@')[0],
        companyName: process.env.COMPANY_NAME || 'FEDEA',
        supportEmail: process.env.SUPPORT_EMAIL || 'support@smartfedea.com',
        currentYear: new Date().getFullYear().toString(),
      };

      for (const [key, value] of Object.entries(replacements)) {
        html = html.replace(new RegExp(`{{${key}}}`, 'g'), value);
      }

      await this.transporter.sendMail({
        from: `"${replacements.companyName}" <${process.env.EMAIL_USER}>`,
        to: userEmail,
        subject: `Welcome to ${replacements.companyName}! 🐾`,
        html: html,
      });

      console.log(`Email sent to ${userEmail}`);
    } catch (error) {
      console.error('Email error:', error);
      throw error;
    }
  }
}
