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

  // =========================================================
  // 🛠 YORDAMCHI METODLAR (PRIVATE)
  // =========================================================

  private roundToThousand(amount: number): number {
    if (!Number.isFinite(amount)) return 0;
    return Math.round(amount / 1000) * 1000;
  }

  private stripTime(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  private calculateLessonsForMonth(
    group: Group,
    joinDate: Date,
  ): { plannedLessons: number; chargedLessons: number } {
    const daysPattern = group.daysPattern;
    const year = joinDate.getFullYear();
    const monthIndex = joinDate.getMonth();

    const monthStart = new Date(year, monthIndex, 1);
    const monthEnd = new Date(year, monthIndex + 1, 0);

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

  private calcAmountDueForJoinMonth(params: {
    monthlyFee: number;
    plannedLessons: number;
    chargedLessons: number;
  }): number {
    const { monthlyFee, plannedLessons, chargedLessons } = params;
    if (!plannedLessons || plannedLessons <= 0) return Math.round(monthlyFee);
    if (!chargedLessons || chargedLessons <= 0) return 0;

    const perLesson = Math.floor(monthlyFee / plannedLessons);
    const remainder = monthlyFee - perLesson * plannedLessons;
    const base = perLesson * chargedLessons;

    return Math.round(base + remainder);
  }

  // =========================================================
  // ✅ ENROLLMENT & TRANSFER UCHUN METODLAR
  // =========================================================

  async hasUnpaidDebt(studentId: string, groupId: string): Promise<boolean> {
    const debt = await this.prisma.tuitionCharge.findFirst({
      where: {
        studentId,
        groupId,
        status: {
          in: [TuitionChargeStatus.PENDING, TuitionChargeStatus.PARTIALLY_PAID],
        },
      },
    });
    return !!debt;
  }

  // src/finance/finance.service.ts

  async createInitialTuitionChargeForEnrollment(params: {
    studentId: string;
    groupId: string;
    joinDate: Date;
    tx?: Prisma.TransactionClient; // Tranzaksiyani qo'llab-quvvatlash uchun
  }) {
    const { studentId, groupId, joinDate, tx } = params;
    const prisma = tx || this.prisma; // Agar tranzaksiya kelsa, undan foydalanamiz

    const group = await prisma.group.findUnique({
      where: { id: groupId },
    });

    if (!group || !group.monthlyFee || group.monthlyFee <= 0) return null;

    const year = joinDate.getFullYear();
    const month = joinDate.getMonth() + 1;

    // 🔥 MUHIM: Yangi qarz yaratishdan oldin, shu oydagi eski guruh qarzlarini tozalaymiz
    // Bu totalCharges oshib ketishining oldini oladi
    const existingCharges = await prisma.tuitionCharge.findMany({
      where: { studentId, year, month, NOT: { groupId } },
      include: { allocations: true },
    });

    for (const oldCharge of existingCharges) {
      const paid = oldCharge.allocations.reduce(
        (s, a) => s + a.amount.toNumber(),
        0,
      );
      if (paid > 0) {
        // Agar eski guruhga pul to'lagan bo'lsa, qarzni to'langan miqdorga tenglaymiz
        await prisma.tuitionCharge.update({
          where: { id: oldCharge.id },
          data: {
            amountDue: new Prisma.Decimal(paid),
            status: TuitionChargeStatus.PAID,
          },
        });
      } else {
        // To'lamagan bo'lsa, eski guruh qarzini butunlay o'chiramiz
        await prisma.tuitionCharge.delete({ where: { id: oldCharge.id } });
      }
    }

    // Endi yangi guruh uchun hisob-kitob qilamiz
    const { plannedLessons, chargedLessons } = this.calculateLessonsForMonth(
      group,
      joinDate,
    );
    const amountDueNumber = this.roundToThousand(
      this.calcAmountDueForJoinMonth({
        monthlyFee: group.monthlyFee,
        plannedLessons,
        chargedLessons,
      }),
    );

    const amountDue = new Prisma.Decimal(amountDueNumber);

    return await prisma.tuitionCharge.upsert({
      where: {
        studentId_groupId_year_month: { studentId, groupId, year, month },
      },
      update: {
        amountDue,
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
  }
  // =========================================================
  // ✅ GLOBAL BALANCE (Controllerdagi qizilni yo'qotadi)
  // =========================================================
  async getGlobalBalance() {
    // 1. Umumiy hisoblangan qarzlar (Chegirmalar ayirilgan holda)
    const charges = await this.prisma.tuitionCharge.findMany({});
    const totalCharges = charges.reduce((sum, c) => {
      const base = c.amountDue.toNumber();
      const discount = c.discount.toNumber();
      return sum + (base - discount);
    }, 0);

    // 2. Faktik qilingan to'lovlar (Allocations orqali)
    const allocAgg = await this.prisma.paymentAllocation.aggregate({
      _sum: { amount: true },
    });
    const totalAllocated = allocAgg._sum.amount?.toNumber() ?? 0;

    // 3. Kassadagi jami pul (Kirim)
    const incomeAgg = await this.prisma.payment.aggregate({
      _sum: { amount: true },
      where: { status: PaymentStatus.COMPLETED },
    });
    const totalIncome = incomeAgg._sum.amount?.toNumber() ?? 0;

    // 4. Jami xarajatlar (Chiqim)
    const expenseAgg = await this.prisma.expense.aggregate({
      _sum: { amount: true },
    });
    const totalExpense = expenseAgg._sum.amount?.toNumber() ?? 0;

    const totalDebt = totalCharges - totalAllocated;

    return {
      totalCharges, // Jami o'quvchilarga yozilgan qarz
      totalIncome, // Jami kassaga tushgan pul
      totalExpense, // Jami xarajatlar
      netCash: totalIncome - totalExpense, // Kassadagi sof qoldiq
      totalDebt, // O'quvchilarning hali to'lamagan qarzi
      totalDebtRounded: this.roundToThousand(totalDebt),
    };
  }
  /**
   * Guruh bo'yicha ma'lum bir oydagi barcha hisob-kitoblarni olish
   */
  async getGroupCharges(groupId: string, year: number, month: number) {
    const charges = await this.prisma.tuitionCharge.findMany({
      where: { groupId, year, month },
      include: {
        student: { include: { user: true } },
        allocations: true, // To'langan qismini hisoblash uchun
      },
    });

    return charges.map((c) => {
      const totalPaid = c.allocations.reduce(
        (sum, a) => sum + a.amount.toNumber(),
        0,
      );
      const amountToPay = c.amountDue.toNumber() - c.discount.toNumber();

      return {
        studentId: c.studentId,
        studentName: `${c.student.user.firstName} ${c.student.user.lastName}`,
        originalAmount: c.amountDue.toNumber(),
        discount: c.discount.toNumber(),
        amountToPay, // To'lanishi kerak bo'lgan sof summa
        alreadyPaid: totalPaid, // Haqiqatda to'lagani
        remainingDebt: amountToPay - totalPaid, // Qolgan qarz
        status: c.status,
        lessons: `${c.chargedLessons}/${c.plannedLessons}`,
      };
    });
  }
  // =========================================================
  // 💰 PAYMENTS (Kirim)
  // =========================================================

  async createPayment(dto: CreatePaymentDto, recordedById: string) {
    const student = await this.prisma.studentProfile.findUnique({
      where: { id: dto.studentId },
    });
    if (!student) throw new NotFoundException('Student topilmadi');

    if (!dto.amount || dto.amount <= 0)
      throw new BadRequestException('Summa 0 dan katta bo‘lishi kerak');

    const payment = await this.prisma.payment.create({
      data: {
        studentId: dto.studentId,
        groupId: dto.groupId ?? null,
        amount: new Prisma.Decimal(dto.amount),
        method: dto.method,
        status: PaymentStatus.COMPLETED,
        paidAt: dto.paidAt ? new Date(dto.paidAt) : new Date(),
        reference: dto.reference,
        comment: dto.comment,
        recordedById,
      },
    });

    await this.allocatePaymentToCharges(payment.id, dto.studentId, dto.groupId);
    return { payment, summary: await this.getStudentSummary(dto.studentId) };
  }
  // src/finance/finance.service.ts ichiga qo'shing

  async cleanupChargeOnTransfer(
    tx: Prisma.TransactionClient,
    studentId: string,
    groupId: string,
    date: Date,
  ) {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;

    // 1. Shu oydagi eski guruh qarzini topamiz
    const charge = await tx.tuitionCharge.findFirst({
      where: { studentId, groupId, year, month },
      include: { allocations: true },
    });

    if (charge) {
      const totalPaid = charge.allocations.reduce(
        (sum, a) => sum + a.amount.toNumber(),
        0,
      );

      if (totalPaid > 0) {
        // Agar qisman to'langan bo'lsa, qarzni to'langan miqdorga tenglaymiz (Total Charge kamayadi)
        await tx.tuitionCharge.update({
          where: { id: charge.id },
          data: {
            amountDue: new Prisma.Decimal(totalPaid),
            status: 'PAID',
          },
        });
      } else {
        // Agar umuman to'lanmagan bo'lsa, bu qarzni o'chirib tashlaymiz
        await tx.tuitionCharge.delete({
          where: { id: charge.id },
        });
      }
    }
  }

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
      const effectiveAmount =
        charge.amountDue.toNumber() - charge.discount.toNumber();
      const outstanding = effectiveAmount - paidSoFar;

      if (outstanding <= 0) continue;

      const allocateAmount = Math.min(remaining, outstanding);
      await this.prisma.paymentAllocation.create({
        data: {
          paymentId: payment.id,
          chargeId: charge.id,
          amount: new Prisma.Decimal(allocateAmount),
        },
      });

      remaining -= allocateAmount;
      const newStatus =
        paidSoFar + allocateAmount >= effectiveAmount
          ? TuitionChargeStatus.PAID
          : TuitionChargeStatus.PARTIALLY_PAID;

      await this.prisma.tuitionCharge.update({
        where: { id: charge.id },
        data: { status: newStatus },
      });
    }
  }

  // =========================================================
  // 💸 EXPENSES (Chiqim)
  // =========================================================

  async createExpense(dto: CreateExpenseDto, recordedById: string) {
    if (!dto.amount || dto.amount <= 0)
      throw new BadRequestException(
        'Chiqim summasi 0 dan katta bo‘lishi kerak',
      );

    return this.prisma.expense.create({
      data: {
        title: dto.title,
        category: dto.category,
        amount: new Prisma.Decimal(dto.amount),
        method: dto.method,
        paidAt: dto.paidAt ? new Date(dto.paidAt) : new Date(),
        note: dto.note,
        recordedById,
      },
    });
  }

  // =========================================================
  // 📊 SUMMARIES & ANALYTICS
  // =========================================================

  async getStudentSummary(studentId: string) {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    // 1️⃣ JORIY OY + HOZIRGI GURUH UCHUN CHARGE
    const currentCharge = await this.prisma.tuitionCharge.findFirst({
      where: {
        studentId,
        year: currentYear,
        month: currentMonth,
      },
      include: { allocations: true },
      orderBy: { createdAt: 'desc' }, // agar bir oyda group almashgan bo‘lsa
    });

    if (!currentCharge) {
      return {
        studentId,
        monthlyCharge: 0,
        monthlyPaid: 0,
        monthlyDebt: 0,
        monthlyDebtRounded: 0,
        totalPaid: 0,
      };
    }

    // 2️⃣ FAQAT HOZIRGI GURUH OYLIK HISOBI
    const monthlyCharge =
      currentCharge.amountDue.toNumber() - currentCharge.discount.toNumber();

    const monthlyPaid = currentCharge.allocations.reduce(
      (sum, a) => sum + a.amount.toNumber(),
      0,
    );

    const monthlyDebt = monthlyCharge - monthlyPaid;

    return {
      studentId,

      // 🔥 FAQAT HOZIRGI GURUH
      monthlyCharge,
      monthlyPaid,
      monthlyDebt,
      monthlyDebtRounded: this.roundToThousand(monthlyDebt),

      // Qo‘shimcha (ixtiyoriy)
      groupId: currentCharge.groupId,
      year: currentYear,
      month: currentMonth,
    };
  }

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

    const [incomeAgg, expenseAgg] = await Promise.all([
      this.prisma.payment.aggregate({
        _sum: { amount: true },
        where: incomeWhere,
      }),
      this.prisma.expense.aggregate({
        _sum: { amount: true },
        where: expenseWhere,
      }),
    ]);

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

    const map = new Map<string, any>();
    for (const c of charges) {
      const debt =
        c.amountDue.toNumber() -
        c.discount.toNumber() -
        c.allocations.reduce((s, a) => s + a.amount.toNumber(), 0);
      if (debt <= 0) continue;

      if (!map.has(c.studentId)) {
        map.set(c.studentId, {
          studentId: c.studentId,
          fullName: `${c.student.user.firstName} ${c.student.user.lastName}`,
          phone: c.student.user.phone,
          totalDebt: 0,
          groups: [],
        });
      }
      const item = map.get(c.studentId);
      item.totalDebt += debt;
      item.groups.push({ name: c.group.name, debt });
    }

    return Array.from(map.values())
      .filter((x) => x.totalDebt >= minDebt)
      .sort((a, b) => b.totalDebt - a.totalDebt);
  }

  ///////////////////////////////////////
  /////////////UMUMIY TARIX/////////
  ////////////////////////////////////

  async getStudentTotalHistory(studentId: string) {
    const charges = await this.prisma.tuitionCharge.findMany({
      where: { studentId },
      include: {
        allocations: true,
        group: true,
      },
      orderBy: [{ year: 'asc' }, { month: 'asc' }],
    });

    // Guruh bo‘yicha yig‘amiz
    const groupMap = new Map<string, any>();

    for (const c of charges) {
      const paid = c.allocations.reduce(
        (sum, a) => sum + a.amount.toNumber(),
        0,
      );

      const effectiveCharge = c.amountDue.toNumber() - c.discount.toNumber();

      if (!groupMap.has(c.groupId)) {
        groupMap.set(c.groupId, {
          groupId: c.groupId,
          groupName: c.group.name,
          totalCharges: 0,
          totalPaid: 0,
          totalDebt: 0,
          months: [],
        });
      }

      const groupItem = groupMap.get(c.groupId);

      groupItem.totalCharges += effectiveCharge;
      groupItem.totalPaid += paid;

      groupItem.months.push({
        year: c.year,
        month: c.month,
        plannedLessons: c.plannedLessons,
        chargedLessons: c.chargedLessons,
        monthlyCharge: effectiveCharge,
        paid,
        debt: effectiveCharge - paid,
        status: c.status,
      });
    }

    // Qarzni hisoblaymiz
    for (const g of groupMap.values()) {
      g.totalDebt = g.totalCharges - g.totalPaid;
      g.totalDebtRounded = this.roundToThousand(g.totalDebt);
    }

    return {
      studentId,
      groups: Array.from(groupMap.values()),
    };
  }

  // =========================================================
  // 🏷 DISCOUNTS
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
    if (!charge) throw new NotFoundException('Hisob topilmadi');
    if (dto.discountAmount > charge.amountDue.toNumber())
      throw new BadRequestException('Chegirma hisobdan katta');

    const paid = charge.allocations.reduce(
      (s, a) => s + a.amount.toNumber(),
      0,
    );
    const effective = charge.amountDue.toNumber() - dto.discountAmount;
    const status =
      paid >= effective
        ? TuitionChargeStatus.PAID
        : paid > 0
          ? TuitionChargeStatus.PARTIALLY_PAID
          : TuitionChargeStatus.PENDING;

    return this.prisma.tuitionCharge.update({
      where: { id: charge.id },
      data: { discount: new Prisma.Decimal(dto.discountAmount), status },
    });
  }
}
