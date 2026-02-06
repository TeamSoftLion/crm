// src/finance/finance.controller.ts
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
  Req,
  ParseIntPipe,
} from '@nestjs/common';
import { FinanceService } from './finance.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Role, PaymentMethod } from '@prisma/client';
import { Request } from 'express';
import { Roles } from 'src/auth/decorator/roles.decorator';
import { ApplyDiscountDto } from './dto/apply-discount.dto';

interface AuthRequest extends Request {
  user: { userId: string; role: Role };
}

@Controller('finance')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FinanceController {
  constructor(private readonly financeService: FinanceService) {}

  // 1. To'lov qabul qilish (Endi tranzaksiya bilan ishlaydi)
  @Post('payments')
  @Roles(Role.ADMIN, Role.MANAGER)
  async createPayment(@Body() dto: CreatePaymentDto, @Req() req: AuthRequest) {
    return this.financeService.createPayment(dto, req.user.userId);
  }

  // 2. Xarajatlar (Chiqim)
  @Post('expenses')
  @Roles(Role.ADMIN, Role.MANAGER)
  async createExpense(@Body() dto: CreateExpenseDto, @Req() req: AuthRequest) {
    return this.financeService.createExpense(dto, req.user.userId);
  }

  // 3. Chegirma berish
  @Post('discount')
  @Roles(Role.ADMIN, Role.MANAGER)
  async applyDiscount(@Body() dto: ApplyDiscountDto) {
    return this.financeService.applyDiscount(dto);
  }

  // 4. Guruh bo'yicha to'lov hisoboti (Darslar soni bilan)
  @Get('groups/:groupId/charges')
  @Roles(Role.ADMIN, Role.MANAGER)
  async getGroupCharges(
    @Param('groupId') groupId: string,
    @Query('year', ParseIntPipe) year: number,
    @Query('month', ParseIntPipe) month: number,
  ) {
    return this.financeService.getGroupCharges(groupId, year, month);
  }

  // 5. Qarzdorlar ro'yxati
  @Get('debtors')
  @Roles(Role.ADMIN, Role.MANAGER)
  async getDebtors(@Query('minDebt') minDebt?: string) {
    return this.financeService.getDebtors(minDebt ? Number(minDebt) : 0);
  }

  // 6. O'quvchi balansi va MonthCharges (Siz xohlagan qism)
  // GET /finance/students/uuid
  @Get('students/summary/:id')
  @Roles(Role.ADMIN, Role.MANAGER)
  async getStudentSummary(@Param('id') studentId: string) {
    return this.financeService.getStudentSummary(studentId);
  }
  @Get('students/history/:id')
  async getStudentFinanceHistory(@Param('id') studentId: string) {
    return this.financeService.getStudentTotalHistory(studentId);
  }

  // 7. Umumiy kassa (Aggregate qilingan Dashboard)
  @Get('balance')
  @Roles(Role.ADMIN, Role.MANAGER)
  async getGlobalBalance() {
    return this.financeService.getGlobalBalance();
  }

  // 8. Davrlar bo'yicha moliya overview
  @Get('overview')
  @Roles(Role.ADMIN, Role.MANAGER)
  async getOverview(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('method') method?: PaymentMethod,
  ) {
    const fromDate = from
      ? new Date(from)
      : new Date(new Date().getFullYear(), 0, 1);
    const toDate = to ? new Date(to) : new Date();
    return this.financeService.getFinanceOverview(fromDate, toDate, method);
  }
}
