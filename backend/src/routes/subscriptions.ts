import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { eq, and } from "drizzle-orm";
import Stripe from "stripe";
import { z } from "zod";
import * as authSchema from "../db/schema/auth-schema.js";
import * as appSchema from "../db/schema/schema.js";
import type { App } from "../index.js";

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";
const APP_URL = process.env.APP_URL || "http://localhost:3001";

let stripe: Stripe | null = null;

function getStripeClient(): Stripe {
  if (!stripe) {
    // If no Stripe key is provided, use mock (for testing)
    if (!STRIPE_SECRET_KEY) {
      stripe = createMockStripeClient();
    } else {
      stripe = new Stripe(STRIPE_SECRET_KEY);
    }
  }
  return stripe;
}

function createMockStripeClient(): any {
  return {
    customers: {
      create: async (params: any) => ({
        id: `cus_${Math.random().toString(36).substr(2, 14)}`,
        ...params,
      }),
    },
    checkout: {
      sessions: {
        create: async (params: any) => ({
          id: `cs_${Math.random().toString(36).substr(2, 24)}`,
          url: `https://checkout.stripe.com/pay/${Math.random().toString(36).substr(2, 24)}`,
          ...params,
        }),
      },
    },
    subscriptions: {
      list: async (params: any) => ({ data: [] }),
      cancel: async (id: string) => ({ id, status: "canceled" }),
    },
    webhooks: {
      constructEvent: (body: string, sig: string, secret: string) => {
        try {
          return JSON.parse(body);
        } catch {
          throw new Error("Invalid event");
        }
      },
    },
  };
}

const createCheckoutSchema = z.object({
  plan: z.enum(["monthly", "yearly"]),
});

const webhookEventSchema = z.object({
  type: z.string(),
  data: z.object({
    object: z.any(),
  }),
});

const PRICING = {
  monthly: 500, // €5.00 in cents
  yearly: 5000, // €50.00 in cents
};

async function getOrCreateStripeCustomer(app: App, userId: string, email: string): Promise<string> {
  const user = await app.db
    .select({ stripeCustomerId: authSchema.user.stripeCustomerId })
    .from(authSchema.user)
    .where(eq(authSchema.user.id, userId));

  if (user[0]?.stripeCustomerId) {
    return user[0].stripeCustomerId;
  }

  const customer = await getStripeClient().customers.create({
    email,
    metadata: { userId },
  });

  await app.db
    .update(authSchema.user)
    .set({ stripeCustomerId: customer.id })
    .where(eq(authSchema.user.id, userId));

  return customer.id;
}

async function createCreditTransaction(
  app: App,
  userId: string,
  amount: number,
  transactionType: string,
  description: string
): Promise<void> {
  await app.db.insert(appSchema.creditTransactions).values({
    userId,
    amount,
    transactionType,
    description,
  });
}

export function registerSubscriptionRoutes(app: App) {
  const requireAuth = app.requireAuth();

  // GET /api/user/credits
  app.fastify.get(
    "/api/user/credits",
    {
      schema: {
        description: "Get current user's credit balance and subscription info",
        tags: ["credits"],
        response: {
          200: {
            type: "object",
            properties: {
              credits: { type: "number" },
              subscriptionStatus: { type: "string", enum: ["free", "monthly", "yearly"] },
              subscriptionEndDate: { type: ["string", "null"], format: "date-time" },
            },
          },
          401: {
            type: "object",
            properties: { error: { type: "string" } },
          },
        },
      },
    },
    async (
      request: FastifyRequest,
      reply: FastifyReply
    ): Promise<{ credits: number; subscriptionStatus: string; subscriptionEndDate: string | null } | void> => {
      const session = await requireAuth(request, reply);
      if (!session) return;

      app.logger.info({ userId: session.user.id }, "Fetching user credits");

      try {
        const user = await app.db
          .select({
            credits: authSchema.user.credits,
            subscriptionStatus: authSchema.user.subscriptionStatus,
            subscriptionEndDate: authSchema.user.subscriptionEndDate,
          })
          .from(authSchema.user)
          .where(eq(authSchema.user.id, session.user.id));

        if (!user.length) {
          app.logger.warn({ userId: session.user.id }, "User not found");
          return reply.status(404).send({ error: "User not found" });
        }

        app.logger.info(
          { userId: session.user.id, credits: user[0].credits },
          "Credits fetched successfully"
        );

        return {
          credits: user[0].credits || 0,
          subscriptionStatus: user[0].subscriptionStatus || "free",
          subscriptionEndDate: user[0].subscriptionEndDate ? user[0].subscriptionEndDate.toISOString() : null,
        };
      } catch (error) {
        app.logger.error({ err: error, userId: session.user.id }, "Failed to fetch credits");
        throw error;
      }
    }
  );

  // POST /api/user/credits/deduct
  app.fastify.post(
    "/api/user/credits/deduct",
    {
      schema: {
        description: "Deduct 1 credit for a video edit",
        tags: ["credits"],
        body: {
          type: "object",
          required: ["projectId"],
          properties: {
            projectId: { type: "string", format: "uuid" },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              remainingCredits: { type: "number" },
            },
          },
          400: {
            type: "object",
            properties: {
              error: { type: "string" },
              message: { type: "string" },
            },
          },
          401: {
            type: "object",
            properties: { error: { type: "string" } },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{
        Body: { projectId: string };
      }>,
      reply: FastifyReply
    ): Promise<{ success: boolean; remainingCredits: number } | void> => {
      const session = await requireAuth(request, reply);
      if (!session) return;

      const { projectId } = request.body;
      app.logger.info(
        { userId: session.user.id, projectId },
        "Attempting to deduct credit for video edit"
      );

      try {
        // First validate that the project exists
        const project = await app.db
          .select({ id: appSchema.videoProjects.id })
          .from(appSchema.videoProjects)
          .where(eq(appSchema.videoProjects.id, projectId));

        if (!project.length) {
          app.logger.warn({ projectId }, "Project not found");
          return reply.status(400).send({
            error: "project_not_found",
            message: "Project not found",
          });
        }

        const user = await app.db
          .select({
            credits: authSchema.user.credits,
            subscriptionStatus: authSchema.user.subscriptionStatus,
            subscriptionEndDate: authSchema.user.subscriptionEndDate,
          })
          .from(authSchema.user)
          .where(eq(authSchema.user.id, session.user.id));

        if (!user.length) {
          app.logger.warn({ userId: session.user.id }, "User not found");
          return reply.status(404).send({ error: "User not found" });
        }

        // Check if user has active subscription
        const hasActiveSubscription =
          (user[0].subscriptionStatus === "monthly" || user[0].subscriptionStatus === "yearly") &&
          user[0].subscriptionEndDate &&
          new Date(user[0].subscriptionEndDate) > new Date();

        if (hasActiveSubscription) {
          app.logger.info(
            { userId: session.user.id },
            "User has active subscription, no credit deduction"
          );
          return {
            success: true,
            remainingCredits: user[0].credits || 0,
          };
        }

        // Check if free user has credits
        const currentCredits = user[0].credits || 0;
        if (currentCredits <= 0) {
          app.logger.warn(
            { userId: session.user.id, credits: currentCredits },
            "Insufficient credits"
          );
          return reply.status(400).send({
            error: "insufficient_credits",
            message: "You need more credits",
          });
        }

        // Deduct 1 credit
        const newCredits = currentCredits - 1;
        await app.db
          .update(authSchema.user)
          .set({ credits: newCredits })
          .where(eq(authSchema.user.id, session.user.id));

        // Create transaction record
        await createCreditTransaction(
          app,
          session.user.id,
          -1,
          "edit_used",
          `Credit deducted for video edit (project ${projectId})`
        );

        app.logger.info(
          { userId: session.user.id, remainingCredits: newCredits },
          "Credit deducted successfully"
        );

        return {
          success: true,
          remainingCredits: newCredits,
        };
      } catch (error) {
        app.logger.error(
          { err: error, userId: session.user.id, projectId },
          "Failed to deduct credit"
        );
        throw error;
      }
    }
  );

  // GET /api/subscriptions/status
  app.fastify.get(
    "/api/subscriptions/status",
    {
      schema: {
        description: "Get current subscription status",
        tags: ["subscriptions"],
        response: {
          200: {
            type: "object",
            properties: {
              status: { type: "string", enum: ["free", "monthly", "yearly"] },
              endDate: { type: ["string", "null"], format: "date-time" },
              hasActiveSubscription: { type: "boolean" },
            },
          },
          401: {
            type: "object",
            properties: { error: { type: "string" } },
          },
        },
      },
    },
    async (
      request: FastifyRequest,
      reply: FastifyReply
    ): Promise<{
      status: string;
      endDate: string | null;
      hasActiveSubscription: boolean;
    } | void> => {
      const session = await requireAuth(request, reply);
      if (!session) return;

      app.logger.info({ userId: session.user.id }, "Fetching subscription status");

      try {
        const user = await app.db
          .select({
            subscriptionStatus: authSchema.user.subscriptionStatus,
            subscriptionEndDate: authSchema.user.subscriptionEndDate,
          })
          .from(authSchema.user)
          .where(eq(authSchema.user.id, session.user.id));

        if (!user.length) {
          app.logger.warn({ userId: session.user.id }, "User not found");
          return reply.status(404).send({ error: "User not found" });
        }

        const hasActiveSubscription =
          (user[0].subscriptionStatus === "monthly" || user[0].subscriptionStatus === "yearly") &&
          user[0].subscriptionEndDate &&
          new Date(user[0].subscriptionEndDate) > new Date();

        app.logger.info(
          { userId: session.user.id, status: user[0].subscriptionStatus },
          "Subscription status fetched"
        );

        return {
          status: user[0].subscriptionStatus || "free",
          endDate: user[0].subscriptionEndDate ? user[0].subscriptionEndDate.toISOString() : null,
          hasActiveSubscription,
        };
      } catch (error) {
        app.logger.error({ err: error, userId: session.user.id }, "Failed to fetch subscription status");
        throw error;
      }
    }
  );

  // POST /api/subscriptions/create-checkout
  app.fastify.post(
    "/api/subscriptions/create-checkout",
    {
      schema: {
        description: "Create a Stripe checkout session for subscription",
        tags: ["subscriptions"],
        body: {
          type: "object",
          required: ["plan"],
          properties: {
            plan: { type: "string", enum: ["monthly", "yearly"] },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              checkoutUrl: { type: "string" },
              sessionId: { type: "string" },
            },
          },
          400: {
            type: "object",
            properties: { error: { type: "string" } },
          },
          401: {
            type: "object",
            properties: { error: { type: "string" } },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{
        Body: { plan: "monthly" | "yearly" };
      }>,
      reply: FastifyReply
    ): Promise<{ checkoutUrl: string; sessionId: string } | void> => {
      const session = await requireAuth(request, reply);
      if (!session) return;

      const { plan } = request.body;
      app.logger.info({ userId: session.user.id, plan }, "Creating checkout session");

      const validation = createCheckoutSchema.safeParse(request.body);
      if (!validation.success) {
        app.logger.warn({ errors: validation.error }, "Invalid request body");
        return reply.status(400).send({ error: "Invalid plan" });
      }

      try {
        const customerId = await getOrCreateStripeCustomer(
          app,
          session.user.id,
          session.user.email
        );

        const checkoutSession = await getStripeClient().checkout.sessions.create({
          customer: customerId,
          payment_method_types: ["card"],
          line_items: [
            {
              price_data: {
                currency: "eur",
                product_data: {
                  name: `VH Cuts ${plan === "monthly" ? "Monthly" : "Yearly"} Subscription`,
                },
                unit_amount: PRICING[plan],
                recurring: {
                  interval: plan === "monthly" ? "month" : "year",
                },
              },
              quantity: 1,
            },
          ],
          mode: "subscription",
          success_url: `${APP_URL}/subscription-success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${APP_URL}/subscription-cancel`,
          metadata: {
            userId: session.user.id,
            plan,
          },
        });

        app.logger.info(
          { userId: session.user.id, sessionId: checkoutSession.id },
          "Checkout session created"
        );

        return {
          checkoutUrl: checkoutSession.url || "",
          sessionId: checkoutSession.id,
        };
      } catch (error) {
        app.logger.error(
          { err: error, userId: session.user.id, plan },
          "Failed to create checkout session"
        );
        throw error;
      }
    }
  );

  // POST /api/subscriptions/cancel
  app.fastify.post(
    "/api/subscriptions/cancel",
    {
      schema: {
        description: "Cancel subscription (remains active until end date)",
        tags: ["subscriptions"],
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              message: { type: "string" },
            },
          },
          401: {
            type: "object",
            properties: { error: { type: "string" } },
          },
        },
      },
    },
    async (
      request: FastifyRequest,
      reply: FastifyReply
    ): Promise<{ success: boolean; message: string } | void> => {
      const session = await requireAuth(request, reply);
      if (!session) return;

      app.logger.info({ userId: session.user.id }, "Canceling subscription");

      try {
        const user = await app.db
          .select({
            stripeCustomerId: authSchema.user.stripeCustomerId,
            subscriptionStatus: authSchema.user.subscriptionStatus,
            subscriptionEndDate: authSchema.user.subscriptionEndDate,
          })
          .from(authSchema.user)
          .where(eq(authSchema.user.id, session.user.id));

        if (!user.length) {
          app.logger.warn({ userId: session.user.id }, "User not found");
          return reply.status(404).send({ error: "User not found" });
        }

        if (user[0].subscriptionStatus === "free") {
          app.logger.info({ userId: session.user.id }, "User has no active subscription");
          return {
            success: true,
            message: "No active subscription to cancel",
          };
        }

        // Find and cancel the active subscription
        if (user[0].stripeCustomerId) {
          const subscriptions = await getStripeClient().subscriptions.list({
            customer: user[0].stripeCustomerId,
            status: "active",
            limit: 1,
          });

          if (subscriptions.data.length > 0) {
            await getStripeClient().subscriptions.cancel(subscriptions.data[0].id);
            app.logger.info(
              { userId: session.user.id, subscriptionId: subscriptions.data[0].id },
              "Stripe subscription canceled"
            );
          }
        }

        const endDate = user[0].subscriptionEndDate
          ? new Date(user[0].subscriptionEndDate).toLocaleDateString()
          : "today";

        app.logger.info({ userId: session.user.id }, "Subscription canceled successfully");

        return {
          success: true,
          message: `Subscription will end on ${endDate}`,
        };
      } catch (error) {
        app.logger.error({ err: error, userId: session.user.id }, "Failed to cancel subscription");
        throw error;
      }
    }
  );

  // POST /api/subscriptions/webhook
  app.fastify.post(
    "/api/subscriptions/webhook",
    {
      schema: {
        description: "Stripe webhook handler",
        tags: ["subscriptions"],
      },
    },
    async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
      const signature = request.headers["stripe-signature"] as string;

      if (!signature) {
        app.logger.warn("Missing stripe signature");
        return reply.status(400).send({ error: "Missing signature" });
      }

      if (!STRIPE_WEBHOOK_SECRET) {
        app.logger.error("STRIPE_WEBHOOK_SECRET not configured");
        return reply.status(500).send({ error: "Webhook not configured" });
      }

      let event: any;
      try {
        event = getStripeClient().webhooks.constructEvent(
          JSON.stringify(request.body),
          signature,
          STRIPE_WEBHOOK_SECRET
        );
      } catch (err) {
        app.logger.warn({ err }, "Webhook signature verification failed");
        return reply.status(400).send({ error: "Invalid signature" });
      }

      app.logger.info({ eventType: event.type }, "Received webhook event");

      try {
        switch (event.type) {
          case "checkout.session.completed": {
            const session = event.data.object;
            const userId = session.metadata?.userId;
            const plan = session.metadata?.plan;

            if (!userId || !plan) {
              app.logger.warn({ session }, "Missing metadata in checkout session");
              break;
            }

            // Calculate subscription end date
            const endDate = new Date();
            if (plan === "monthly") {
              endDate.setMonth(endDate.getMonth() + 1);
            } else {
              endDate.setFullYear(endDate.getFullYear() + 1);
            }

            // Update user subscription
            await app.db
              .update(authSchema.user)
              .set({
                subscriptionStatus: plan,
                subscriptionEndDate: endDate,
              })
              .where(eq(authSchema.user.id, userId));

            // Create transaction record
            await createCreditTransaction(
              app,
              userId,
              0,
              "subscription_granted",
              `${plan === "monthly" ? "Monthly" : "Yearly"} subscription activated`
            );

            app.logger.info(
              { userId, plan, endDate },
              "Subscription activated via checkout"
            );
            break;
          }

          case "customer.subscription.updated": {
            const subscription = event.data.object;
            const customerId = subscription.customer;
            const status = subscription.status;

            // Find user by customer ID
            const user = await app.db
              .select({ id: authSchema.user.id })
              .from(authSchema.user)
              .where(eq(authSchema.user.stripeCustomerId, customerId));

            if (!user.length) {
              app.logger.warn({ customerId }, "User not found for subscription update");
              break;
            }

            const userId = user[0].id;

            if (status === "active" || status === "past_due") {
              const items = subscription.items.data;
              const item = items[0];
              if (item.price.recurring?.interval) {
                const plan = item.price.recurring.interval === "month" ? "monthly" : "yearly";
                const endDate = new Date(subscription.current_period_end * 1000);

                await app.db
                  .update(authSchema.user)
                  .set({
                    subscriptionStatus: plan,
                    subscriptionEndDate: endDate,
                  })
                  .where(eq(authSchema.user.id, userId));

                app.logger.info(
                  { userId, plan, endDate },
                  "Subscription updated"
                );
              }
            }
            break;
          }

          case "customer.subscription.deleted": {
            const subscription = event.data.object;
            const customerId = subscription.customer;

            const user = await app.db
              .select({ id: authSchema.user.id })
              .from(authSchema.user)
              .where(eq(authSchema.user.stripeCustomerId, customerId));

            if (!user.length) {
              app.logger.warn({ customerId }, "User not found for subscription deletion");
              break;
            }

            const userId = user[0].id;

            await app.db
              .update(authSchema.user)
              .set({
                subscriptionStatus: "free",
                subscriptionEndDate: null,
              })
              .where(eq(authSchema.user.id, userId));

            app.logger.info({ userId }, "Subscription deleted, user reverted to free");
            break;
          }

          case "invoice.payment_succeeded": {
            const invoice = event.data.object;
            const customerId = invoice.customer;

            const user = await app.db
              .select({ id: authSchema.user.id })
              .from(authSchema.user)
              .where(eq(authSchema.user.stripeCustomerId, customerId));

            if (!user.length) {
              app.logger.warn({ customerId }, "User not found for invoice payment");
              break;
            }

            const userId = user[0].id;

            // Create transaction record
            await createCreditTransaction(
              app,
              userId,
              0,
              "subscription_granted",
              `Subscription renewal payment succeeded`
            );

            app.logger.info({ userId }, "Invoice payment succeeded, subscription renewed");
            break;
          }

          default:
            app.logger.debug({ eventType: event.type }, "Unhandled webhook event");
        }

        return reply.status(200).send({ received: true });
      } catch (error) {
        app.logger.error(
          { err: error, eventType: event.type },
          "Failed to process webhook"
        );
        return reply.status(500).send({ error: "Webhook processing failed" });
      }
    }
  );
}
