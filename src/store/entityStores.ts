import { createEntityStore } from './createEntityStore';
import * as seed from '@/infrastructure/seed/data';
import type { Equipment, FinanceEntry, License, NonConformity, Pest, Product, RecurringPayable, ServiceType, TreatedArea, Vehicle } from '@/domain/types';

/** Stores reativas dos demais módulos (CRUD standalone, persistido). */
export const useProductsStore = createEntityStore<Product>('namira-products', seed.products);
export const useFinanceStore = createEntityStore<FinanceEntry>('namira-finance', seed.financeEntries);
export const useEquipmentStore = createEntityStore<Equipment>('namira-equipment', seed.equipment);
export const useVehiclesStore = createEntityStore<Vehicle>('namira-vehicles', seed.vehicles);
export const useServiceTypesStore = createEntityStore<ServiceType>('namira-servicetypes', seed.serviceTypes);
export const useNonConformitiesStore = createEntityStore<NonConformity>('namira-nonconformities', seed.nonConformities);
export const usePestsStore = createEntityStore<Pest>('namira-pests', seed.pests);
export const useAreasStore = createEntityStore<TreatedArea>('namira-areas', seed.treatedAreas);
export const useLicensesStore = createEntityStore<License>('namira-licenses', seed.licenses);
export const useRecurringPayablesStore = createEntityStore<RecurringPayable>('namira-recurring-payables', seed.recurringPayables);
