import type { ISODate } from './dates';

export type VehicleType = 'car' | 'commercial' | 'motorcycle';
export type FuelType = 'gasoline' | 'diesel' | 'lpg' | 'gasoline_lpg' | 'hybrid' | 'plugin_hybrid' | 'electric';
export type Transmission = 'manual' | 'automatic' | 'dct' | 'cvt';

export interface Vehicle {
  id: string;
  vehicleType: VehicleType;
  make: string;
  model: string;
  modelYear: number;
  engineLabel: string | null;
  fuelType: FuelType;
  transmission: Transmission;
  odometerKm: number;
  plate: string | null;
  /** Yalnızca maskeli hali istemciye gelir; açık şasi numarası sunucuda şifreli tutulur. */
  vinMasked: string | null;
  photoUrl: string | null;
  createdAt: string;
}

/**
 * Bakım aralığının nereden geldiği. Brif kuralı: doğrulanmamış üretici aralığı kesin bilgi gibi gösterilmez.
 * `manufacturer_verified` yalnızca lisanslı katalogdan gelen veriyle, sunucu tarafında atanabilir.
 */
export type IntervalSource = 'user' | 'service' | 'manufacturer_verified' | 'legal' | 'seasonal';

export type RuleKind = 'interval' | 'due_date';

export interface MaintenanceRule {
  id: string;
  vehicleId: string;
  itemKey: string;
  title: string;
  kind: RuleKind;
  everyKm: number | null;
  everyMonths: number | null;
  lastDoneKm: number | null;
  lastDoneOn: ISODate | null;
  dueOn: ISODate | null;
  source: IntervalSource;
  remindBeforeKm: number;
  remindBeforeDays: number;
  enabled: boolean;
}

export interface MaintenanceEvent {
  id: string;
  vehicleId: string;
  ruleId: string | null;
  title: string;
  performedOn: ISODate;
  odometerKm: number | null;
  cost: number | null;
  performedBy: string | null;
  notes: string | null;
  hasDocument: boolean;
}

export type EnergyUnit = 'L' | 'kWh';

export interface FuelRecord {
  id: string;
  vehicleId: string;
  filledOn: ISODate;
  odometerKm: number;
  quantity: number;
  unit: EnergyUnit;
  unitPrice: number;
  totalAmount: number;
  isFullTank: boolean;
  fuelType: FuelType;
}

export type ExpenseCategory =
  | 'maintenance'
  | 'repair'
  | 'insurance'
  | 'inspection'
  | 'tax'
  | 'parking'
  | 'toll'
  | 'wash'
  | 'fine'
  | 'other';

export interface ExpenseRecord {
  id: string;
  vehicleId: string;
  category: ExpenseCategory;
  amount: number;
  spentOn: ISODate;
  note: string | null;
}

export type Plan = 'free' | 'plus';
