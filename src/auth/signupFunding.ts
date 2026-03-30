import type { SignupQuote, SignupFundingIntent } from "./types";
import {
  getCheckoutPreview,
  resolvePriceId,
  initializeCheckout,
} from "./checkout";

/** Thin wrapper over checkout preview that returns a simplified signup quote. */
export async function getSignupQuote(
  jwt: string,
  options: {
    plan: string;
    period: "monthly" | "yearly";
    refId: string;
    couponCode?: string;
  },
  userAgent?: string
): Promise<SignupQuote> {
  const preview = await getCheckoutPreview(
    jwt,
    options.plan,
    options.period,
    options.refId,
    options.couponCode,
    userAgent
  );
  return {
    plan: preview.planName,
    period: preview.period,
    baseAmountCents: preview.baseAmount,
    discountCents: preview.discounts,
    creditsCents: preview.appliedCredits + preview.proratedCredits,
    dueTodayCents: preview.dueToday,
    destinationWallet: preview.destinationWallet,
    note: preview.note,
    coupon: preview.coupon,
  };
}

/**
 * Resolve plan pricing and initialize a payment intent for signup funding.
 * Authenticates, resolves the priceId, and creates a checkout intent.
 */
export async function initializeSignupFunding(
  jwt: string,
  options: {
    plan: string;
    period: "monthly" | "yearly";
    refId: string;
    walletAddress?: string;
    email?: string;
    firstName?: string;
    lastName?: string;
    couponCode?: string;
  },
  userAgent?: string
): Promise<SignupFundingIntent> {
  const priceId = await resolvePriceId(
    jwt,
    options.plan,
    options.period,
    userAgent
  );
  const intent = await initializeCheckout(
    jwt,
    {
      priceId,
      refId: options.refId,
      email: options.email,
      firstName: options.firstName,
      lastName: options.lastName,
      couponCode: options.couponCode,
      paymentMode: "sponsored",
      signupWalletAddress: options.walletAddress,
    },
    userAgent
  );
  return {
    paymentIntentId: intent.id,
    amountCents: intent.amount,
    destinationWallet: intent.destinationWallet,
    solanaPayUrl: intent.solanaPayUrl,
    expiresAt: intent.expiresAt,
  };
}
