import type { Plan } from './types';

/** Plan sınırları. Sunucudaki `enforce_vehicle_limit` tetikleyicisiyle aynı değerleri kullanır. */
export const PLAN_LIMITS: Record<Plan, { maxVehicles: number }> = {
  free: { maxVehicles: 5 },
  plus: { maxVehicles: 50 },
};

export function canAddVehicle(plan: Plan, activeVehicleCount: number): boolean {
  return activeVehicleCount < PLAN_LIMITS[plan].maxVehicles;
}
