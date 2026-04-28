export type MenuCategory = "main" | "drink" | "snack";

export type OrderStatus = "pending" | "ready" | "picked_up";

export type CreateOrderInput = {
  items: Array<{ menuItemId: string; quantity: number }>;
  notes?: string;
  pickupAt?: string; // ISO 8601 string, validated server-side
};
