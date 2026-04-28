import { prisma } from "@/lib/prisma";

export const SLOT_CAPACITY = 10;

/** Returns the current time. In development, DEV_NOW overrides it for testing. */
export function getNow(): Date {
  if (process.env.NODE_ENV !== "production" && process.env.DEV_NOW) {
    return new Date(process.env.DEV_NOW);
  }
  return new Date();
}

function floorToSlot(d: Date): Date {
  const out = new Date(d);
  out.setMinutes(Math.floor(out.getMinutes() / 15) * 15, 0, 0);
  return out;
}

export function generateLunchSlots(date: Date): Date[] {
  const slots: Date[] = [];
  for (let h = 11; h <= 13; h++) {
    for (let m = 0; m < 60; m += 15) {
      if (h === 11 && m < 30) continue;
      if (h === 13 && m > 45) break;
      const s = new Date(date);
      s.setHours(h, m, 0, 0);
      slots.push(s);
    }
  }
  return slots;
}

export class OrderService {
  static async listForUser(userId: string) {
    return prisma.order.findMany({
      where: { userId },
      include: { items: { include: { menuItem: true } } },
      orderBy: { createdAt: "desc" },
    });
  }

  static async slotAvailability(date: Date): Promise<Record<string, number>> {
    const start = new Date(date);
    start.setHours(11, 30, 0, 0);
    const end = new Date(date);
    end.setHours(13, 45, 0, 0);

    const rows = await prisma.order.groupBy({
      by: ["pickupAt"],
      where: { pickupAt: { gte: start, lte: end, not: null } },
      _count: { pickupAt: true },
    });

    const counts: Record<string, number> = {};
    for (const row of rows) {
      if (row.pickupAt) counts[row.pickupAt.toISOString()] = row._count.pickupAt;
    }
    return counts;
  }

  static async create(args: {
    userId: string;
    items: Array<{ menuItemId: string; quantity: number }>;
    notes?: string;
    pickupAt?: string;
  }) {
    const { userId, items, notes, pickupAt: pickupAtStr } = args;

    // Validate pickupAt before entering the transaction (pure validation, no DB)
    let pickupAtDate: Date | undefined;
    if (pickupAtStr !== undefined) {
      const parsed = new Date(pickupAtStr);
      if (isNaN(parsed.getTime())) {
        throw new Error("pickupAt is not a valid date");
      }
      if (
        ![0, 15, 30, 45].includes(parsed.getMinutes()) ||
        parsed.getSeconds() !== 0 ||
        parsed.getMilliseconds() !== 0
      ) {
        throw new Error("pickupAt must be on a 15-minute boundary with zero seconds and milliseconds");
      }
      if (parsed < floorToSlot(getNow())) {
        throw new Error("pickupAt is in the past");
      }
      const today = getNow();
      const slotStart = new Date(today);
      slotStart.setHours(11, 30, 0, 0);
      const slotEnd = new Date(today);
      slotEnd.setHours(13, 45, 0, 0);
      if (parsed < slotStart || parsed > slotEnd) {
        throw new Error("pickupAt must be within the lunch window (11:30–13:45)");
      }
      pickupAtDate = parsed;
    }

    const menuItems = await prisma.menuItem.findMany({
      where: { id: { in: items.map((i) => i.menuItemId) }, available: true },
    });

    const totalCents = items.reduce((sum, item) => {
      const m = menuItems.find((mi) => mi.id === item.menuItemId);
      if (!m) return sum;
      return sum + m.priceCents * item.quantity;
    }, 0);

    return prisma.$transaction(async (tx) => {
      if (pickupAtDate !== undefined) {
        const start = new Date(pickupAtDate);
        start.setHours(11, 30, 0, 0);
        const end = new Date(pickupAtDate);
        end.setHours(13, 45, 0, 0);

        const rows = await tx.order.groupBy({
          by: ["pickupAt"],
          where: { pickupAt: { gte: start, lte: end, not: null } },
          _count: { pickupAt: true },
        });

        const counts: Record<string, number> = {};
        for (const row of rows) {
          if (row.pickupAt) counts[row.pickupAt.toISOString()] = row._count.pickupAt;
        }
        const count = counts[pickupAtDate.toISOString()] ?? 0;
        if (count >= SLOT_CAPACITY) {
          throw new Error("slot is full");
        }
      }

      return tx.order.create({
        data: {
          userId,
          notes,
          totalCents,
          pickupAt: pickupAtDate,
          items: {
            create: items.map((item) => {
              const m = menuItems.find((mi) => mi.id === item.menuItemId);
              return {
                menuItemId: item.menuItemId,
                quantity: item.quantity,
                unitPriceCents: m?.priceCents ?? 0,
              };
            }),
          },
        },
        include: { items: { include: { menuItem: true } } },
      });
    });
  }

  static async byId(id: string, userId: string) {
    return prisma.order.findFirst({
      where: { id, userId },
      include: { items: { include: { menuItem: true } } },
    });
  }

  static async updateStatus(id: string, userId: string, status: string) {
    const allowed = new Set(["pending", "ready", "picked_up"]);
    if (!allowed.has(status)) {
      throw new Error(`invalid status: ${status}`);
    }
    const order = await prisma.order.findFirst({ where: { id, userId } });
    if (!order) return null;
    return prisma.order.update({
      where: { id },
      data: { status },
      include: { items: { include: { menuItem: true } } },
    });
  }

  static async remove(id: string, userId: string) {
    const order = await prisma.order.findFirst({ where: { id, userId } });
    if (!order) return null;
    return prisma.order.delete({ where: { id } });
  }
}

