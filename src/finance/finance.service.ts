// src/finance/finance.service.ts
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DaysPattern,
  Group,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  TuitionChargeStatus,
} from '@prisma/client';
import { PrismaService } from 'prisma/prisma.service';

import { CreatePaymentDto } from './dto/create-payment.dto';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { ApplyDiscountDto } from './dto/apply-discount.dto';

@Injectable()
export class FinanceService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Qarzni “ming so‘mga” yaxlitlab ko‘rsatish uchun (UI/Hisobot)
   */
  private roundToThousand(amount: number): number {
    if (!Number.isFinite(amount)) return 0;
    return Math.round(amount / 1000) * 1000;
  }

  /**
   * Date dan vaqtni olib tashlash (00:00:00)
   */
  private stripTime(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  /**
   * ODD (Du/Cho/Ju) yoki EVEN (Se/Pa/Sha) bo‘yicha
   * oy ichidagi:
   *  - plannedLessons = umumiy darslar
   *  - chargedLessons = joinDate dan keyingi darslar
   */
  private calculateLessonsForMonth(
    group: Group,
    joinDate: Date,
  ): { plannedLessons: number; chargedLessons: number } {
    const daysPattern = group.daysPattern;

    const year = joinDate.getFullYear();
    const monthIndex = joinDate.getMonth(); // 0-11

    const monthStart = new Date(year, monthIndex, 1);
    const monthEnd = new Date(year, monthIndex + 1, 0);

    // JS: Yakshanba=0, Du=1, Se=2, Cho=3, Pa=4, Ju=5, Sha=6
    const oddDays = [1, 3, 5]; // Du / Cho / Ju
    const evenDays = [2, 4, 6]; // Se / Pa / Sha

    const targetWeekdays = daysPattern === DaysPattern.ODD ? oddDays : evenDays;

    let plannedLessons = 0;
    let chargedLessons = 0;

    const join = this.stripTime(joinDate);

    for (
      let d = new Date(monthStart.getTime());
      d <= monthEnd;
      d.setDate(d.getDate() + 1)
    ) {
      const weekday = d.getDay();

      if (targetWeekdays.includes(weekday)) {
        plannedLessons++;

        if (this.stripTime(d) >= join) {
          chargedLessons++;
        }
      }
    }

    return { plannedLessons, chargedLessons };
  }

  /**
   * ✅ “Kasrsiz” (qoldiqsiz) hisoblash:
   *  - perLesson = floor(monthlyFee / plannedLessons)
   *  - remainder = monthlyFee - perLesson*plannedLessons
   *  - remainder yo‘qolmasligi uchun chargedLessons > 0 bo‘lsa qo‘shib yuboramiz
   */
  private calcAmountDueForJoinMonth(params: {
    monthlyFee: number;
    plannedLessons: number;
    chargedLessons: number;
  }): number {
    const { monthlyFee, plannedLessons, chargedLessons } = params;

    // fallback
    if (!plannedLessons || plannedLessons <= 0) return Math.round(monthlyFee);
    if (!chargedLessons || chargedLessons <= 0) return 0;

    const perLesson = Math.floor(monthlyFee / plannedLessons);
    const remainder = monthlyFee - perLesson * plannedLessons;

    const base = perLesson * chargedLessons;

    // remainder yo‘qolib ketmasin (kasr chiqmasin!)
    const finalAmount = base + remainder;

    return Math.round(finalAmount);
  }

  // =========================================================
  // ✅ PAYMENT CREATE
  // =========================================================
  async createPayment(dto: CreatePaymentDto, recordedById: string) {
    // 1) student check
    const student = await this.prisma.studentProfile.findUnique({
      where: { id: dto.studentId },
    });
    if (!student) throw new NotFoundException('Student topilmadi');

    // 2) payment create
    const paidAt = dto.paidAt ? new Date(dto.paidAt) : new Date();

    if (!dto.amount || dto.amount <= 0) {
      throw new BadRequestException(
        'To‘lov summasi 0 dan katta bo‘lishi kerak',
      );
    }

    const payment = await this.prisma.payment.create({
      data: {
        studentId: dto.studentId,
        groupId: dto.groupId ?? null,
        amount: new Prisma.Decimal(dto.amount),
        method: dto.method,
        status: PaymentStatus.COMPLETED,
        paidAt,
        reference: dto.reference,
        comment: dto.comment,
        recordedById,
      },
    });

    // 3) allocate
    await this.allocatePaymentToCharges(payment.id, dto.studentId, dto.groupId);

    // 4) summary
    const summary = await this.getStudentSummary(dto.studentId);

    return { payment, summary };
  }

  // =========================================================
  // ✅ ALLOCATION: PAYMENT → TUITIONCHARGE
  // =========================================================
  private async allocatePaymentToCharges(
    paymentId: string,
    studentId: string,
    groupId?: string,
  ) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
    });
    if (!payment) return;

    let remaining = payment.amount.toNumber();
    if (remaining <= 0) return;

    const charges = await this.prisma.tuitionCharge.findMany({
      where: {
        studentId,
        ...(groupId ? { groupId } : {}),
        status: {
          in: [TuitionChargeStatus.PENDING, TuitionChargeStatus.PARTIALLY_PAID],
        },
      },
      include: { allocations: true },
      orderBy: [{ year: 'asc' }, { month: 'asc' }],
    });

    for (const charge of charges) {
      if (remaining <= 0) break;

      const paidSoFar = charge.allocations.reduce(
        (sum, a) => sum + a.amount.toNumber(),
        0,
      );

      // ✅ effective amount = amountDue - discount
      const effectiveAmount =
        charge.amountDue.toNumber() - charge.discount.toNumber();

      const outstanding = effectiveAmount - paidSoFar;
      if (outstanding <= 0) {
        // agar allaqachon yopilgan bo‘lsa statusni PAID qilib qo‘yamiz
        await this.prisma.tuitionCharge.update({
          where: { id: charge.id },
          data: { status: TuitionChargeStatus.PAID },
        });
        continue;
      }

      const allocateAmount = Math.min(remaining, outstanding);

      await this.prisma.paymentAllocation.create({
        data: {
          paymentId: payment.id,
          chargeId: charge.id,
          amount: new Prisma.Decimal(allocateAmount),
        },
      });

      remaining -= allocateAmount;

      const newPaidTotal = paidSoFar + allocateAmount;

      const newStatus =
        newPaidTotal >= effectiveAmount
          ? TuitionChargeStatus.PAID
          : TuitionChargeStatus.PARTIALLY_PAID;

      await this.prisma.tuitionCharge.update({
        where: { id: charge.id },
        data: { status: newStatus },
      });
    }

    // NOTE: remaining > 0 bo‘lsa — bu “advance payment”
    // Hozircha uni alohida ledger sifatida saqlamayapmiz.
  }

  // =========================================================
  // ✅ EXPENSE CREATE
  // =========================================================
  async createExpense(dto: CreateExpenseDto, recordedById: string) {
    if (!dto.amount || dto.amount <= 0) {
      throw new BadRequestException(
        'Chiqim summasi 0 dan katta bo‘lishi kerak',
      );
    }

    const paidAt = dto.paidAt ? new Date(dto.paidAt) : new Date();

    return this.prisma.expense.create({
      data: {
        title: dto.title,
        category: dto.category,
        amount: new Prisma.Decimal(dto.amount),
        method: dto.method,
        paidAt,
        note: dto.note,
        recordedById,
      },
    });
  }

  // =========================================================
  // ✅ STUDENT SUMMARY
  // =========================================================
  async getStudentSummary(studentId: string) {
    const student = await this.prisma.studentProfile.findUnique({
      where: { id: studentId },
    });
    if (!student) throw new NotFoundException('Student topilmadi');

    const charges = await this.prisma.tuitionCharge.findMany({
      where: {
        studentId,
        status: {
          in: [
            TuitionChargeStatus.PENDING,
            TuitionChargeStatus.PARTIALLY_PAID,
            TuitionChargeStatus.PAID,
          ],
        },
      },
    });

    // ✅ effective total = (amountDue - discount)
    const totalCharges = charges.reduce((sum, c) => {
      const amount = c.amountDue.toNumber();
      const discount = c.discount.toNumber();
      return sum + (amount - discount);
    }, 0);

    const allocationsAgg = await this.prisma.paymentAllocation.aggregate({
      _sum: { amount: true },
      where: {
        charge: {
          studentId,
          status: {
            in: [
              TuitionChargeStatus.PENDING,
              TuitionChargeStatus.PARTIALLY_PAID,
              TuitionChargeStatus.PAID,
            ],
          },
        },
      },
    });

    const totalPaid = allocationsAgg._sum.amount?.toNumber() ?? 0;

    const debt = totalCharges - totalPaid;
    const debtRounded = this.roundToThousand(debt);

    const lastPayments = await this.prisma.payment.findMany({
      where: { studentId },
      orderBy: { paidAt: 'desc' },
      take: 5,
    });

    return {
      studentId,
      totalCharges,
      totalPaid,
      debt,
      debtRounded,
      lastPayments,
    };
  }

  // =========================================================
  // ✅ FINANCE OVERVIEW (period + method)
  // =========================================================
  async getFinanceOverview(from: Date, to: Date, method?: PaymentMethod) {
    const incomeWhere: Prisma.PaymentWhereInput = {
      status: PaymentStatus.COMPLETED,
      paidAt: { gte: from, lte: to },
      ...(method ? { method } : {}),
    };

    const expenseWhere: Prisma.ExpenseWhereInput = {
      paidAt: { gte: from, lte: to },
      ...(method ? { method } : {}),
    };

    const incomeAgg = await this.prisma.payment.aggregate({
      _sum: { amount: true },
      where: incomeWhere,
    });

    const expenseAgg = await this.prisma.expense.aggregate({
      _sum: { amount: true },
      where: expenseWhere,
    });

    const totalIncome = incomeAgg._sum.amount?.toNumber() ?? 0;
    const totalExpense = expenseAgg._sum.amount?.toNumber() ?? 0;

    return {
      from,
      to,
      method: method ?? 'ALL',
      totalIncome,
      totalExpense,
      profit: totalIncome - totalExpense,
    };
  }

  // =========================================================
  // ✅ INITIAL TUITION CHARGE (Enrollment payti)
  // =========================================================
  async createInitialTuitionChargeForEnrollment(params: {
    studentId: string;
    groupId: string;
    joinDate: Date;
  }) {
    const { studentId, groupId, joinDate } = params;

    const group = await this.prisma.group.findUnique({
      where: { id: groupId },
    });

    if (!group) {
      console.warn('[FINANCE] Group topilmadi, charge yaratilmaydi', {
        groupId,
      });
      return null;
    }

    if (!group.monthlyFee || group.monthlyFee <= 0) {
      console.warn('[FINANCE] monthlyFee = 0, charge yaratilmaydi', {
        groupId,
        monthlyFee: group.monthlyFee,
      });
      return null;
    }

    const year = joinDate.getFullYear();
    const month = joinDate.getMonth() + 1;

    const { plannedLessons, chargedLessons } = this.calculateLessonsForMonth(
      group,
      joinDate,
    );

    // ✅ 1) kasrsiz summa (butun so'm)
    const rawAmountDueNumber = this.calcAmountDueForJoinMonth({
      monthlyFee: group.monthlyFee,
      plannedLessons,
      chargedLessons,
    });

    // ✅ 2) ENG MUHIM: endi DB ga ham 1000 so'mga karrali qilib yozamiz
    const amountDueNumber = this.roundToThousand(rawAmountDueNumber);

    const amountDue = new Prisma.Decimal(amountDueNumber);

    const charge = await this.prisma.tuitionCharge.upsert({
      where: {
        studentId_groupId_year_month: { studentId, groupId, year, month },
      },
      update: {
        amountDue,
        discount: new Prisma.Decimal(0),
        plannedLessons,
        chargedLessons,
        status:
          amountDueNumber === 0
            ? TuitionChargeStatus.PAID
            : TuitionChargeStatus.PENDING,
      },
      create: {
        studentId,
        groupId,
        year,
        month,
        amountDue,
        discount: new Prisma.Decimal(0),
        plannedLessons,
        chargedLessons,
        status:
          amountDueNumber === 0
            ? TuitionChargeStatus.PAID
            : TuitionChargeStatus.PENDING,
      },
    });

    console.log('[FINANCE] TuitionCharge created/updated:', charge.id, {
      studentId,
      groupId,
      year,
      month,
      amountDue: amountDueNumber, // ✅ endi minglik karrali
      plannedLessons,
      chargedLessons,
    });

    return charge;
  }

  // =========================================================
  // ✅ GLOBAL BALANCE
  // =========================================================
  async getGlobalBalance() {
    const charges = await this.prisma.tuitionCharge.findMany({});
    const totalCharges = charges.reduce((sum, c) => {
      const base = c.amountDue.toNumber();
      const discount = c.discount.toNumber();
      return sum + (base - discount);
    }, 0);

    const allocAgg = await this.prisma.paymentAllocation.aggregate({
      _sum: { amount: true },
    });
    const totalAllocated = allocAgg._sum.amount?.toNumber() ?? 0;

    const totalDebt = totalCharges - totalAllocated;
    const totalDebtRounded = this.roundToThousand(totalDebt);

    const incomeAgg = await this.prisma.payment.aggregate({
      _sum: { amount: true },
      where: { status: PaymentStatus.COMPLETED },
    });
    const totalIncome = incomeAgg._sum.amount?.toNumber() ?? 0;

    const expenseAgg = await this.prisma.expense.aggregate({
      _sum: { amount: true },
    });
    const totalExpense = expenseAgg._sum.amount?.toNumber() ?? 0;

    const netCash = totalIncome - totalExpense;

    return {
      totalCharges,
      totalIncome,
      totalExpense,
      netCash,
      totalDebt,
      totalDebtRounded,
    };
  }

  // =========================================================
  // ✅ DEBTORS LIST
  // =========================================================
  async getDebtors(minDebt = 0) {
    const charges = await this.prisma.tuitionCharge.findMany({
      where: {
        status: {
          in: [TuitionChargeStatus.PENDING, TuitionChargeStatus.PARTIALLY_PAID],
        },
      },
      include: {
        allocations: true,
        student: { include: { user: true } },
        group: true,
      },
    });

    const map = new Map<
      string,
      {
        studentId: string;
        fullName: string;
        phone: string;
        totalDebt: number;
        totalDebtRounded: number;
        groups: { groupId: string; name: string; debt: number }[];
      }
    >();

    for (const c of charges) {
      const effective = c.amountDue.toNumber() - c.discount.toNumber();

      const paid = c.allocations.reduce(
        (sum, a) => sum + a.amount.toNumber(),
        0,
      );

      const debt = effective - paid;
      if (debt <= 0) continue;

      const key = c.studentId;

      if (!map.has(key)) {
        map.set(key, {
          studentId: c.studentId,
          fullName: `${c.student.user.firstName} ${c.student.user.lastName}`,
          phone: c.student.user.phone,
          totalDebt: 0,
          totalDebtRounded: 0,
          groups: [],
        });
      }

      const item = map.get(key)!;
      item.totalDebt += debt;
      item.totalDebtRounded = this.roundToThousand(item.totalDebt);

      item.groups.push({
        groupId: c.groupId,
        name: c.group.name,
        debt,
      });
    }

    return Array.from(map.values())
      .filter((x) => x.totalDebt >= minDebt)
      .sort((a, b) => b.totalDebt - a.totalDebt);
  }

  // =========================================================
  // ✅ APPLY DISCOUNT
  // =========================================================
  async applyDiscount(dto: ApplyDiscountDto) {
    const charge = await this.prisma.tuitionCharge.findUnique({
      where: {
        studentId_groupId_year_month: {
          studentId: dto.studentId,
          groupId: dto.groupId,
          year: dto.year,
          month: dto.month,
        },
      },
      include: { allocations: true },
    });

    if (!charge) {
      throw new NotFoundException('Bu oy uchun hisob topilmadi');
    }

    const amountDue = charge.amountDue.toNumber();

    if (dto.discountAmount < 0) {
      throw new BadRequestException('Chegirma manfiy bo‘lishi mumkin emas');
    }

    if (dto.discountAmount > amountDue) {
      throw new BadRequestException(
        'Chegirma summasi hisobdan katta bo‘lishi mumkin emas',
      );
    }

    const discount = new Prisma.Decimal(dto.discountAmount);

    // ✅ paid total
    const paid = charge.allocations.reduce(
      (sum, a) => sum + a.amount.toNumber(),
      0,
    );

    // ✅ effective = amountDue - discount
    const effectiveAmount = amountDue - dto.discountAmount;

    const status =
      paid >= effectiveAmount
        ? TuitionChargeStatus.PAID
        : paid > 0
          ? TuitionChargeStatus.PARTIALLY_PAID
          : TuitionChargeStatus.PENDING;

    const updated = await this.prisma.tuitionCharge.update({
      where: { id: charge.id },
      data: {
        discount,
        status,
      },
    });

    return updated;
  }
}
