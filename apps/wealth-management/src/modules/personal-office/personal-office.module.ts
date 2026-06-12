import { Module } from '@nestjs/common';
import { PersonalOfficeService } from './personal-office.service';
import { PersonalOfficeController } from './personal-office.controller';

@Module({
  controllers: [PersonalOfficeController],
  providers: [PersonalOfficeService],
})
export class PersonalOfficeModule {}
