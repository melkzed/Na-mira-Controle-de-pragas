import { createEntityStore } from './createEntityStore';
import * as seed from '@/infrastructure/seed/data';
import type { Equipment, FinanceEntry, Product, Vehicle } from '@/domain/types';

/** Stores reativas dos demais módulos (CRUD standalone, persistido). */
export const useProductsStore = createEntityStore<Product>('namira-products', seed.products);
export const useFinanceStore = createEntityStore<FinanceEntry>('namira-finance', seed.financeEntries);
export const useEquipmentStore = createEntityStore<Equipment>('namira-equipment', seed.equipment);
export const useVehiclesStore = createEntityStore<Vehicle>('namira-vehicles', seed.vehicles);
