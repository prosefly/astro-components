import type { Price, Rating } from './types.js';

export function formatRating(rating: Rating): string {
  const value = formatNumber(rating.value);
  return rating.best === undefined ? value : `${value} / ${formatNumber(rating.best)}`;
}

export function ratingLabel(rating: Rating): string {
  const score = formatRating(rating);
  if (rating.count === undefined) return `Rated ${score}`;
  return `Rated ${score} from ${formatInteger(rating.count)} ratings`;
}

export function formatPrice(price: Price): string {
  if ('amount' in price) {
    if (price.amount === 0) return 'Free';
    return formatAmount(price.amount, price.currency);
  }

  if (price.low === 0 && price.high === 0) return 'Free';
  return `${formatAmount(price.low, price.currency)}–${formatAmount(price.high, price.currency)}`;
}

export function formatRatingCount(count: number): string {
  return `${formatInteger(count)} ratings`;
}

function formatAmount(amount: number, currency: string | undefined): string {
  if (!currency) return formatNumber(amount);

  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    }).format(amount);
  } catch {
    return `${formatNumber(amount)} ${currency}`;
  }
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
}

function formatInteger(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value);
}
