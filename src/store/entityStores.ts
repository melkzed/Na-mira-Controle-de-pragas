import { createEntityStore } from './createEntityStore';
import * as seed from '@/infrastructure/seed/data';
import type { BankAccount, Check, Department, Equipment, FinanceEntry, License, LoanInvestment, NonConformity, Pest, Product, RecurringPayable, ServiceType, StockLocation, TreatedArea, TrapType, User, Vehicle } from '@/domain/types';

/** Stores reativas dos demais módulos (CRUD, dual-mode — ver createEntityStore.ts). */
export const useUsersStore = createEntityStore<User>('namira-users', seed.users, 'users');
export const useDepartmentsStore = createEntityStore<Department>('namira-departments', seed.departments, 'departments');
export const useProductsStore = createEntityStore<Product>('namira-products', seed.products, 'products');
export const useFinanceStore = createEntityStore<FinanceEntry>('namira-finance', seed.financeEntries, 'finance_entries');
export const useEquipmentStore = createEntityStore<Equipment>('namira-equipment', seed.equipment, 'equipment');
export const useVehiclesStore = createEntityStore<Vehicle>('namira-vehicles', seed.vehicles, 'vehicles');
export const useServiceTypesStore = createEntityStore<ServiceType>('namira-servicetypes', seed.serviceTypes, 'service_types');
export const useNonConformitiesStore = createEntityStore<NonConformity>('namira-nonconformities', seed.nonConformities, 'non_conformities');
export const usePestsStore = createEntityStore<Pest>('namira-pests', seed.pests, 'pests');
export const useAreasStore = createEntityStore<TreatedArea>('namira-areas', seed.treatedAreas, 'treated_areas');
export const useTrapTypesStore = createEntityStore<TrapType>('namira-trap-types', seed.trapTypes, 'trap_types');
export const useLicensesStore = createEntityStore<License>('namira-licenses', seed.licenses, 'licenses');
export const useRecurringPayablesStore = createEntityStore<RecurringPayable>('namira-recurring-payables', seed.recurringPayables, 'recurring_payables');
export const useBankAccountsStore = createEntityStore<BankAccount>('namira-bank-accounts', seed.bankAccounts, 'bank_accounts');
export const useChecksStore = createEntityStore<Check>('namira-checks', [], 'checks');
export const useLoansStore = createEntityStore<LoanInvestment>('namira-loans', [], 'loan_investments');
/** Locais de estoque (central, por técnico, por veículo). Cada técnico tem o
 *  seu — criado junto com o cadastro dele, ver `ensureTechnicianStockLocation`
 *  em `src/store/stockLocations.ts`. */
export const useStockLocationsStore = createEntityStore<StockLocation>('namira-stock-locations', seed.stockLocations, 'stock_locations');
