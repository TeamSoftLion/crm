import { PrismaClient, TuitionChargeStatus } from '@prisma/client';

const prisma = new PrismaClient();

function roundToThousand(n: number) {
  return Math.round(n / 1000) * 1000;
}

async function main() {
  console.log('✅ Fix rounding started...');

  const charges = await prisma.tuitionCharge.findMany({
    include: { allocations: true },
  });

  let updatedCount = 0;

  for (const c of charges) {
    const amountDue = c.amountDue.toNumber();
    const discount = c.discount.toNumber();

    const newAmountDue = roundToThousand(amountDue);
    const newDiscount = roundToThousand(discount);

    const paid = c.allocations.reduce((sum, a) => sum + a.amount.toNumber(), 0);

    const effective = newAmountDue - newDiscount;

    const newStatus =
      paid >= effective
        ? TuitionChargeStatus.PAID
        : paid > 0
          ? TuitionChargeStatus.PARTIALLY_PAID
          : TuitionChargeStatus.PENDING;

    const changed = newAmountDue !== amountDue;
    newDiscount !== discount;
    newStatus !== c.status;

    if (!changed) continue;

    await prisma.tuitionCharge.update({
      where: { id: c.id },
      data: {
        amountDue: newAmountDue,
        discount: newDiscount,
        status: newStatus,
      },
    });

    updatedCount++;
  }

  console.log(`✅ Done. Updated charges: ${updatedCount}`);
}

main()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
