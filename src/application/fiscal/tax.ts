/**
 * Tributação automática de serviços (NFS-e).
 * Calcula ISS e as retenções aplicáveis quando o tomador é pessoa jurídica,
 * conforme o regime tributário — para o operador não fazer conta na mão.
 * As alíquotas são configuráveis (variam por município e por CNAE).
 */
import type { InvoiceTaxes } from '@/domain/types';

export type TaxRegime = 'simples' | 'presumido' | 'real';

export interface TaxConfig {
  /** Alíquota de ISS (ex.: 0.03 = 3%). Definida pelo município. */
  issRate: number;
  regime: TaxRegime;
  /** ISS retido pelo tomador (definido pela legislação municipal). */
  issRetido: boolean;
  /** Aplicar retenções federais (IRRF/INSS/PIS/COFINS/CSLL) para tomador PJ. */
  retencoes: boolean;
  /** Reter INSS (11%) — serviços com cessão de mão de obra. */
  inssRetido: boolean;
  /** Alíquota de IRRF (serviços de limpeza/dedetização: 1%). */
  irrfRate: number;
}

export const DEFAULT_TAX_CONFIG: TaxConfig = {
  issRate: 0.03,
  regime: 'simples',
  issRetido: false,
  retencoes: false,
  inssRetido: false,
  irrfRate: 0.01,
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Calcula o detalhamento tributário de uma nota.
 * @param amount valor bruto do serviço
 * @param cfg configuração fiscal (alíquotas e regime)
 * @param tomadorPJ o tomador é pessoa jurídica (habilita retenções)
 */
export function computeTaxes(amount: number, cfg: TaxConfig, tomadorPJ: boolean): InvoiceTaxes {
  const iss = round2(amount * cfg.issRate);

  // No Simples Nacional, PIS/COFINS/CSLL/IRRF em geral não são retidos (recolhidos via DAS).
  const aplicaFederais = cfg.retencoes && tomadorPJ && cfg.regime !== 'simples';
  const irrf = aplicaFederais ? round2(amount * cfg.irrfRate) : 0;
  const pis = aplicaFederais ? round2(amount * 0.0065) : 0;
  const cofins = aplicaFederais ? round2(amount * 0.03) : 0;
  const csll = aplicaFederais ? round2(amount * 0.01) : 0;
  const inss = cfg.retencoes && tomadorPJ && cfg.inssRetido ? round2(amount * 0.11) : 0;
  const issRet = cfg.issRetido ? iss : 0;

  const totalRetencoes = round2(irrf + pis + cofins + csll + inss + issRet);
  const net = round2(amount - totalRetencoes);

  return { issRate: cfg.issRate, iss, issRetido: cfg.issRetido, irrf, inss, pis, cofins, csll, totalRetencoes, net };
}
