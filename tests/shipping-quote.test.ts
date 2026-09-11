import { expect, test } from "bun:test";
import { shippingQuoteCents } from "../examples/shipping-quote.ts";

test("charges standard shipping below the free-shipping minimum", () => {
  expect(shippingQuoteCents(4900)).toBe(500);
});

test("ships orders above the minimum for free", () => {
  expect(shippingQuoteCents(5100)).toBe(0);
});
