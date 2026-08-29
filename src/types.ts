export type ViewName = 'home' | 'inventory' | 'meals' | 'shopping' | 'assistant';

export interface Household {
  id: string;
  name: string;
  timezone: string;
  default_servings: number;
  default_lunch_time: string;
  default_dinner_time: string;
}

export interface InventoryItem {
  id: string;
  household_id: string;
  item_name: string;
  category: string;
  quantity: number | null;
  unit: string | null;
  location: string;
  expiry_date: string | null;
  minimum_stock: number | null;
  quantity_pending: boolean;
  status: 'active' | 'depleted' | 'discarded' | 'archived';
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ShoppingItem {
  id: string;
  household_id: string;
  item_name: string;
  category: string;
  needed_quantity: number | null;
  unit: string | null;
  priority: 'low' | 'medium' | 'high';
  reason: string | null;
  status: 'active' | 'purchased' | 'removed';
  created_at: string;
}

export interface Meal {
  id: string;
  household_id: string;
  meal_date: string;
  meal_type: 'Breakfast' | 'Lunch' | 'Dinner' | 'Snack';
  dish: string;
  status: 'planned' | 'scheduled' | 'skipped' | 'completed' | 'cancelled';
  scheduled_start: string | null;
  notes: string | null;
  calendar_event_id: string | null;
}

export interface InventoryEvent {
  id: string;
  event_type: string;
  quantity_before: number | null;
  quantity_delta: number | null;
  quantity_after: number | null;
  unit: string | null;
  notes: string | null;
  created_at: string;
  inventory_item_id: string | null;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}
