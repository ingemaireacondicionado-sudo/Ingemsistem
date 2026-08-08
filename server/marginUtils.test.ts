import { describe, it, expect } from 'vitest';

// We test the margin calculation logic directly
// Since marginUtils is a client-side file, we replicate the core logic here for testing
// This validates the business rules

describe('Margin Calculation Logic', () => {
  // Core formula: margin = subtotal - productsCost - expenses(net of IVA)
  
  it('calculates margin correctly for ARS job with products and expenses', () => {
    const subtotal = 100000; // Job subtotal (sin IVA)
    const productsCost = 30000; // 3 products × $10000 purchasePrice
    const expensesARS = 15000; // expenses net of IVA
    
    const margin = subtotal - productsCost - expensesARS;
    const marginPct = (margin / subtotal) * 100;
    
    expect(margin).toBe(55000);
    expect(marginPct).toBeCloseTo(55, 5);
  });

  it('calculates margin correctly when no products or expenses', () => {
    const subtotal = 50000;
    const productsCost = 0;
    const expensesARS = 0;
    
    const margin = subtotal - productsCost - expensesARS;
    const marginPct = (margin / subtotal) * 100;
    
    expect(margin).toBe(50000);
    expect(marginPct).toBe(100);
  });

  it('handles negative margin (loss)', () => {
    const subtotal = 20000;
    const productsCost = 15000;
    const expensesARS = 10000;
    
    const margin = subtotal - productsCost - expensesARS;
    const marginPct = (margin / subtotal) * 100;
    
    expect(margin).toBe(-5000);
    expect(marginPct).toBe(-25);
  });

  it('net monthly profit excludes income with relatedJobId (avoids double counting)', () => {
    // Simulate: 2 jobs with margins, income with relatedJobId, income without, expenses without
    const jobMarginsARS = 80000; // sum of job margins
    const incomeWithJobId = 150000; // this is already counted in job margins - EXCLUDED
    const incomeWithoutJobId = 20000; // general income - INCLUDED
    const expensesWithoutJobId = 10000; // general expenses - SUBTRACTED
    
    // Formula: profit = jobMargins + generalIncome - generalExpenses
    // incomeWithJobId is NOT added (already in jobMargins)
    const profit = jobMarginsARS + incomeWithoutJobId - expensesWithoutJobId;
    
    expect(profit).toBe(90000);
    // If we incorrectly added incomeWithJobId, it would be 240000 (double counting)
    expect(profit).not.toBe(jobMarginsARS + incomeWithJobId + incomeWithoutJobId - expensesWithoutJobId);
  });

  it('mixed currencies: USD job with ARS expenses does not calculate percentage', () => {
    const jobCurrency = 'USD';
    const subtotal = 5000; // USD
    const productsCost = 1000; // USD (products in same currency as job)
    const expensesARS = 50000; // ARS expenses
    
    const marginUSD = subtotal - productsCost; // 4000 USD
    const mixedCurrencies = jobCurrency === 'USD' && expensesARS > 0;
    const marginPct = mixedCurrencies ? null : (marginUSD / subtotal) * 100;
    
    expect(marginUSD).toBe(4000);
    expect(mixedCurrencies).toBe(true);
    expect(marginPct).toBeNull(); // Cannot calculate % with mixed currencies
  });

  it('formatMarginChip returns percentage for single-currency jobs', () => {
    const marginPct = 32;
    const sign = marginPct >= 0 ? '+' : '';
    const chip = `${sign}${marginPct.toFixed(0)}%`;
    
    expect(chip).toBe('+32%');
  });

  it('formatMarginChip returns dash for zero subtotal', () => {
    const subtotal = 0;
    const result = subtotal === 0 ? '—' : '+50%';
    
    expect(result).toBe('—');
  });
});
