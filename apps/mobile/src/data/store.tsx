/**
 * Uygulama durumu: oturum, araçlar, seçili araç ve seçili aracın kayıtları.
 * Her değişiklikten sonra ilgili veri yeniden yüklenir; tek doğruluk kaynağı veri katmanıdır.
 */
import { computeDue, sortByUrgency, todayISO, type DueInfo, type MaintenanceRule, type Vehicle } from '@piston/core';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { env } from '@/lib/env';
import { DemoRepo } from './demo-repo';
import { RepoError, type Account, type GarageRepo, type VehicleBundle } from './repo';
import { SupabaseRepo } from './supabase-repo';

const ACTIVE_KEY = 'piston-active-vehicle';
const EMPTY: VehicleBundle = { rules: [], events: [], fuel: [], expenses: [] };

export const repo: GarageRepo = env.isDemo ? new DemoRepo() : new SupabaseRepo();

export interface RuleWithDue {
  rule: MaintenanceRule;
  due: DueInfo;
}

interface AppState {
  ready: boolean;
  account: Account | null;
  vehicles: Vehicle[];
  active: Vehicle | null;
  bundle: VehicleBundle;
  rulesByUrgency: RuleWithDue[];
  bundleLoading: boolean;
  error: string | null;
  today: string;
  selectVehicle(id: string): void;
  refresh(): Promise<void>;
  /** Bir işlemi çalıştırır, ardından verileri yeniler. Hata kullanıcıya gösterilecek metinle fırlatılır. */
  run<T>(fn: (r: GarageRepo) => Promise<T>): Promise<T>;
  bundleFor(vehicleId: string): VehicleBundle;
}

const Ctx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [account, setAccount] = useState<Account | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [bundles, setBundles] = useState<Record<string, VehicleBundle>>({});
  const [bundleLoading, setBundleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const today = todayISO();
  const activeRef = useRef<string | null>(null);

  const loadBundle = useCallback(async (vid: string) => {
    setBundleLoading(true);
    try {
      const b = await repo.loadBundle(vid);
      setBundles((prev) => ({ ...prev, [vid]: b }));
    } finally {
      setBundleLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const acc = await repo.getAccount();
      setError(null);
      setAccount(acc);
      if (!acc) {
        setVehicles([]);
        setBundles({});
        return;
      }
      const list = await repo.listVehicles();
      setVehicles(list);
      let saved: string | null = activeRef.current;
      if (!saved) {
        try { saved = await AsyncStorage.getItem(ACTIVE_KEY); } catch { saved = null; }
      }
      const next = list.find((v) => v.id === saved)?.id ?? list[0]?.id ?? null;
      activeRef.current = next;
      setActiveId(next);
      if (next) await loadBundle(next);
    } catch (e) {
      setError(e instanceof RepoError ? e.message : 'Veriler yüklenemedi.');
    }
  }, [loadBundle]);

  useEffect(() => {
    // Dış veri kaynağından ilk yükleme; setState çağrıları await sonrasında, asenkron çalışır.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh().finally(() => setReady(true));
    return repo.onAuthChange(() => { void refresh(); });
  }, [refresh]);

  const selectVehicle = useCallback((id: string) => {
    activeRef.current = id;
    setActiveId(id);
    AsyncStorage.setItem(ACTIVE_KEY, id).catch(() => {});
    void loadBundle(id);
  }, [loadBundle]);

  const run = useCallback(async <T,>(fn: (r: GarageRepo) => Promise<T>) => {
    try {
      const out = await fn(repo);
      await refresh();
      return out;
    } catch (e) {
      if (e instanceof RepoError) throw e;
      throw new RepoError('UNKNOWN', 'İşlem tamamlanamadı. Tekrar dene.');
    }
  }, [refresh]);

  const active = vehicles.find((v) => v.id === activeId) ?? null;
  const bundle = (activeId && bundles[activeId]) || EMPTY;

  const rulesByUrgency = useMemo(() => {
    if (!active) return [];
    return sortByUrgency(bundle.rules.filter((r) => r.enabled).map((rule) => ({ rule, due: computeDue(rule, active.odometerKm, today) })));
  }, [active, bundle.rules, today]);

  const bundleFor = useCallback((vid: string) => bundles[vid] ?? EMPTY, [bundles]);

  const value: AppState = { ready, account, vehicles, active, bundle, rulesByUrgency, bundleLoading, error, today, selectVehicle, refresh, run, bundleFor };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp, AppProvider içinde kullanılmalı');
  return v;
}

/** URL'deki araç kimliğine göre aracı ve kayıtlarını döndürür. */
export function useVehicle(id: string | undefined) {
  const app = useApp();
  const vehicle = app.vehicles.find((v) => v.id === id) ?? null;
  useEffect(() => {
    if (vehicle && app.active?.id !== vehicle.id) app.selectVehicle(vehicle.id);
  }, [vehicle, app]);
  return { vehicle, bundle: vehicle ? app.bundleFor(vehicle.id) : EMPTY };
}
