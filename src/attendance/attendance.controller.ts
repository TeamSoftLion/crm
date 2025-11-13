import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { OpenSheetDto } from './dto/open-sheet.dto';
import { MarkAttendanceDto } from './dto/mark-attendance.dto';
import { QuerySheetDto } from './dto/query-sheet.dto';

@Controller('attendance')
export class AttendanceController {
  constructor(private readonly service: AttendanceService) {}

  @Post('open-sheet')
  open(@Body() dto: OpenSheetDto) {
    return this.service.openSheet(dto);
  }

  @Patch(':sheetId/mark')
  mark(
    @Param('sheetId') sheetId: string,
    @Body() dto: MarkAttendanceDto,
    @Req() req: any,
  ) {
    const userId = req.user?.id ?? 'system'; // Auth’dan olasan
    return this.service.mark(sheetId, dto, userId);
  }

  @Get('sheet/:sheetId')
  getOne(@Param('sheetId') sheetId: string) {
    return this.service.getSheet(sheetId);
  }

  @Get('sheets')
  list(@Query() q: QuerySheetDto) {
    return this.service.listSheets(q);
  }
}
