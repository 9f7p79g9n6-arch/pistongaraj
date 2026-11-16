/**
 * PISTON SERVİS durumu: aktif mod (bireysel / işletme), işletmeler, seçili işletmenin müşteri, araç ve kayıtları,
 * müşteri tarafındaki servis kayıtları. Bireysel AppProvider'dan ayrıdır; onun verisini değiştirmez.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { hasPermission, needsCustomerAction, type Business, type BusinessCustomer, type BusinessExpense, type BusinessVehicle, type ServiceRecord } from '@piston/core';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { env } from '@/lib/env';
import { RepoError } from './repo';
import { ServiceDemoRepo } from './service-demo-repo';
import type { ServiceRepo } from './service-repo';
import { ServiceSupabaseRepo } from './service-supabase-repo';
import { repo, useApp } from './store';
import type { SupabaseRepo } from './supabase-repo';

export const serviceRepo: ServiceRepo = env.isDemo ? new ServiceDemoRepo() : new ServiceSupabaseRepo((repo as SupabaseRepo).sb);

const MODE_KEY = 'piston-mode';
const BIZ_KEY = 'piston-servis-active';
const ADV_KEY = 'piston-servis-advanced';

export type AppMode = 'personal' | 'business';

interface BusinessState {
  ready: boolean;
  mode: AppMode;
  setMode(m: AppMode): void;
  businesses: Business[];
  business: Business | null;
  selectBusiness(id: string): void;
  advanced: boolean;
  setAdvanced(v: boolean): void;
  customers: BusinessCustomer[];
  vehicles: BusinessVehicle[];
  records: ServiceRecord[];
  /** İşletme giderleri (yalnızca finans yetkisi olan rolde dolu) */
  expenses: BusinessExpense[];
  /** PISTON CİRO'yu görebilir mi (sahip, müdür) */
  canFinance: boolean;
  /** Servis kaydı silebilir mi (sahip, müdür) */
  canDelete: boolean;
  /** Müşteri tarafı: bu hesaba gelen servis kayıtları */
  myRecords: ServiceRecord[];
  myPendingCount: number;
  error: string | null;
  refresh(): Promise<void>;
  run<T>(fn: (r: ServiceRepo) => Promise<T>): Promise<T>;
}

const Ctx = createContext<BusinessState | null>(null);

async function getItem(k: string) {
  try { return await AsyncStorage.getItem(k); } catch { return null; }
}
function setItem(k: string, v: string) {
  AsyncStorage.setItem(k, v).catch(() => {});
}

export function BusinessProvider({ children }: { children: ReactNode }) {
  const { account } = useApp();
  // Hangi hesap için yüklendi: hesap değişince (giriş/çıkış) yeni veri gelene kadar "hazır" sayılmaz
  const [loadedFor, setLoadedFor] = useState<string | null | undefined>(undefined);
  const ready = loadedFor === (account?.userId ?? null);
  const [mode, setModeState] = useState<AppMode>('personal');
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [advanced, setAdvancedState] = useState(false);
  const [customers, setCustomers] = useState<BusinessCustomer[]>([]);
  const [vehicles, setVehicles] = useState<BusinessVehicle[]>([]);
  const [records, setRecords] = useState<ServiceRecord[]>([]);
  const [myRecords, setMyRecords] = useState<ServiceRecord[]>([]);
  const [expenses, setExpenses] = useState<BusinessExpense[]>([]);
  const [error, setError] = useState<string | null>(null);

  const loadBusinessData = useCallback(async (bid: string) => {
    // Giderler yalnızca yetkili rolde döner (sunucu RLS); yetkisiz rolde boş liste gelir
    const [c, v, r, x] = await Promise.all([
      serviceRepo.listCustomers(bid), serviceRepo.listVehicles(bid), serviceRepo.listRecords(bid), serviceRepo.listExpenses(bid).catch(() => []),
    ]);
    setCustomers(c);
    setVehicles(v);
    setRecords(r);
    setExpenses(x);
  }, []);

  const refresh = useCallback(async () => {
    if (!account) {
      setBusinesses([]); setCustomers([]); setVehicles([]); setRecords([]); setMyRecords([]); setExpenses([]);
      return;
    }
    try {
      const [list, mine] = await Promise.all([serviceRepo.listMyBusinesses(), serviceRepo.myRecords()]);
      setBusinesses(list);
      setMyRecords(mine);
      const saved = activeId ?? (await getItem(BIZ_KEY));
      const next = list.find((b) => b.id === saved)?.id ?? list[0]?.id ?? null;
      setActiveId(next);
      if (next) await loadBusinessData(next);
      else { setCustomers([]); setVehicles([]); setRecords([]); setExpenses([]); }
      setError(null);
    } catch (e) {
      setError(e instanceof RepoError ? e.message : 'İşletme verileri yüklenemedi.');
    }
  }, [account, activeId, loadBusinessData]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [m, adv] = await Promise.all([getItem(MODE_KEY), getItem(ADV_KEY)]);
      if (!alive) return;
      if (m === 'business') setModeState('business');
      setAdvancedState(adv === '1');
      await refresh();
      if (alive) setLoadedFor(account?.userId ?? null);
    })();
    return () => { alive = false; };
    // Hesap değişince yeniden yükle
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account?.userId]);

  const setMode = useCallback((m: AppMode) => { setModeState(m); setItem(MODE_KEY, m); }, []);
  const setAdvanced = useCallback((v: boolean) => { setAdvancedState(v); setItem(ADV_KEY, v ? '1' : '0'); }, []);
  const selectBusiness = useCallback((bid: string) => {
    setActiveId(bid);
    setItem(BIZ_KEY, bid);
    void loadBusinessData(bid);
  }, [loadBusinessData]);

  const run = useCallback(async <T,>(fn: (r: ServiceRepo) => Promise<T>) => {
    try {
      const out = await fn(serviceRepo);
      await refresh();
      return out;
    } catch (e) {
      if (e instanceof RepoError) throw e;
      throw new RepoError('UNKNOWN', 'İşlem tamamlanamadı. Tekrar dene.');
    }
  }, [refresh]);

  const business = businesses.find((b) => b.id === activeId) ?? null;
  const myPendingCount = useMemo(() => myRecords.filter((r) => needsCustomerAction(r.status)).length, [myRecords]);
  const canFinance = !!business && hasPermission(business.role, 'finance.view');
  const canDelete = !!business && hasPermission(business.role, 'record.delete');

  const value: BusinessState = {
    ready, mode, setMode, businesses, business, selectBusiness, advanced, setAdvanced,
    customers, vehicles, records, expenses, canFinance, canDelete, myRecords, myPendingCount, error, refresh, run,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useBusiness(): BusinessState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useBusiness, BusinessProvider içinde kullanılmalı');
  return v;
}
