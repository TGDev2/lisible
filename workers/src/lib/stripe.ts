import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2023-10-16",
});

/**
 * Cancel a Stripe subscription
 * @param subscriptionId - The Stripe subscription ID
 * @returns True if cancelled successfully, false if subscription not found
 */
export async function cancelSubscription(subscriptionId: string): Promise<boolean> {
  try {
    await stripe.subscriptions.cancel(subscriptionId);
    return true;
  } catch (error) {
    if (error instanceof Stripe.errors.StripeError && error.code === "resource_missing") {
      // Subscription doesn't exist or already cancelled
      return false;
    }
    throw error;
  }
}

export { stripe };
