export function shippingQuoteCents(subtotalCents: number): number {
  const freeShippingMinimumCents = 5000;
  const standardShippingCents = 500;

  return subtotalCents > freeShippingMinimumCents ? 0 : standardShippingCents;
}
