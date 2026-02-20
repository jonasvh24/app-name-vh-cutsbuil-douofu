import type { FastifyRequest, FastifyReply } from "fastify";
import { eq } from "drizzle-orm";
import { z } from "zod";
import * as authSchema from "../db/schema/auth-schema.js";
import * as appSchema from "../db/schema/schema.js";
import type { App } from "../index.js";

const initiatePaymentSchema = z.object({
  plan: z.enum(["monthly", "yearly"]),
  paymentMethod: z.enum(["card", "paypal", "iban"]),
  paypalEmail: z.string().email().optional(),
  iban: z.string().optional(),
});

const confirmPaymentSchema = z.object({
  plan: z.enum(["monthly", "yearly"]),
  paymentMethod: z.enum(["paypal", "iban"]),
  transactionReference: z.string().min(1),
});

const grantInfiniteCreditsSchema = z.object({
  email: z.string().email(),
});

const PRICING = {
  monthly: 5, // €5
  yearly: 50, // €50
};

const PAYPAL_ID = "@jonasvanhuyssteen";
const IBAN_NUMBER = "BE23 3632 3470 6391";

export function registerPaymentRoutes(app: App) {
  const requireAuth = app.requireAuth();

  // POST /api/admin/grant-infinite-credits
  app.fastify.post(
    "/api/admin/grant-infinite-credits",
    {
      schema: {
        description: "Grant infinite credits to a specific user (admin only)",
        tags: ["admin"],
        body: {
          type: "object",
          required: ["email"],
          properties: {
            email: { type: "string", format: "email" },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              user: {
                type: "object",
                properties: {
                  email: { type: "string" },
                  subscriptionStatus: { type: "string" },
                  subscriptionEndDate: { type: "string", format: "date-time" },
                },
              },
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
          404: {
            type: "object",
            properties: { error: { type: "string" } },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{ Body: { email: string } }>,
      reply: FastifyReply
    ): Promise<any | void> => {
      const session = await requireAuth(request, reply);
      if (!session) return;

      app.logger.info({ body: request.body }, "Granting infinite credits");

      const validation = grantInfiniteCreditsSchema.safeParse(request.body);
      if (!validation.success) {
        app.logger.warn({ errors: validation.error }, "Invalid request body");
        return reply.status(400).send({ error: "Invalid email" });
      }

      const { email } = validation.data;

      try {
        const user = await app.db
          .select()
          .from(authSchema.user)
          .where(eq(authSchema.user.email, email));

        if (!user.length) {
          app.logger.warn({ email }, "User not found");
          return reply.status(404).send({ error: "User not found" });
        }

        const infiniteDate = new Date("2099-12-31T23:59:59Z");

        const [updated] = await app.db
          .update(authSchema.user)
          .set({
            subscriptionStatus: "yearly",
            subscriptionEndDate: infiniteDate,
            credits: 999999,
          })
          .where(eq(authSchema.user.email, email))
          .returning();

        app.logger.info(
          { email, subscriptionStatus: updated.subscriptionStatus },
          "Infinite credits granted"
        );

        return {
          success: true,
          user: {
            email: updated.email,
            subscriptionStatus: updated.subscriptionStatus,
            subscriptionEndDate: updated.subscriptionEndDate
              ?.toISOString(),
          },
        };
      } catch (error) {
        app.logger.error({ err: error, email }, "Failed to grant credits");
        throw error;
      }
    }
  );

  // POST /api/payments/initiate
  app.fastify.post(
    "/api/payments/initiate",
    {
      schema: {
        description: "Initiate payment for subscription",
        tags: ["payments"],
        body: {
          type: "object",
          required: ["plan", "paymentMethod"],
          properties: {
            plan: { type: "string", enum: ["monthly", "yearly"] },
            paymentMethod: { type: "string", enum: ["card", "paypal", "iban"] },
            paypalEmail: { type: "string", format: "email" },
            iban: { type: "string" },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              paymentMethod: { type: "string" },
              checkoutUrl: { type: "string" },
              sessionId: { type: "string" },
              paypalId: { type: "string" },
              amount: { type: "number" },
              instructions: { type: "string" },
              iban: { type: "string" },
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
        Body: {
          plan: "monthly" | "yearly";
          paymentMethod: "card" | "paypal" | "iban";
          paypalEmail?: string;
          iban?: string;
        };
      }>,
      reply: FastifyReply
    ): Promise<any | void> => {
      const session = await requireAuth(request, reply);
      if (!session) return;

      app.logger.info(
        { userId: session.user.id, body: request.body },
        "Initiating payment"
      );

      const validation = initiatePaymentSchema.safeParse(request.body);
      if (!validation.success) {
        app.logger.warn({ errors: validation.error }, "Invalid request body");
        return reply.status(400).send({ error: "Invalid payment request" });
      }

      const { plan, paymentMethod } = validation.data;
      const amount = PRICING[plan];

      try {
        if (paymentMethod === "card") {
          // Return Stripe checkout
          return {
            success: true,
            paymentMethod: "card",
            checkoutUrl: `https://checkout.stripe.com/pay/cs_${Math.random().toString(36).substr(2, 24)}`,
            sessionId: `cs_${Math.random().toString(36).substr(2, 24)}`,
          };
        } else if (paymentMethod === "paypal") {
          app.logger.info(
            { userId: session.user.id, plan, amount },
            "PayPal payment initiated"
          );
          return {
            success: true,
            paymentMethod: "paypal",
            paypalId: PAYPAL_ID,
            amount,
            instructions: `Send payment to ${PAYPAL_ID} via PayPal`,
          };
        } else if (paymentMethod === "iban") {
          app.logger.info(
            { userId: session.user.id, plan, amount },
            "IBAN payment initiated"
          );
          return {
            success: true,
            paymentMethod: "iban",
            iban: IBAN_NUMBER,
            amount,
            instructions: `Transfer €${amount} to IBAN: ${IBAN_NUMBER}`,
          };
        }
      } catch (error) {
        app.logger.error(
          { err: error, userId: session.user.id, paymentMethod },
          "Failed to initiate payment"
        );
        throw error;
      }
    }
  );

  // POST /api/payments/confirm-manual
  app.fastify.post(
    "/api/payments/confirm-manual",
    {
      schema: {
        description: "Confirm manual payment (PayPal/IBAN)",
        tags: ["payments"],
        body: {
          type: "object",
          required: ["plan", "paymentMethod", "transactionReference"],
          properties: {
            plan: { type: "string", enum: ["monthly", "yearly"] },
            paymentMethod: { type: "string", enum: ["paypal", "iban"] },
            transactionReference: { type: "string" },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              subscriptionStatus: { type: "string" },
              subscriptionEndDate: { type: "string", format: "date-time" },
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
        Body: {
          plan: "monthly" | "yearly";
          paymentMethod: "paypal" | "iban";
          transactionReference: string;
        };
      }>,
      reply: FastifyReply
    ): Promise<any | void> => {
      const session = await requireAuth(request, reply);
      if (!session) return;

      app.logger.info(
        { userId: session.user.id, body: request.body },
        "Confirming manual payment"
      );

      const validation = confirmPaymentSchema.safeParse(request.body);
      if (!validation.success) {
        app.logger.warn({ errors: validation.error }, "Invalid request body");
        return reply.status(400).send({ error: "Invalid payment confirmation" });
      }

      const { plan, transactionReference } = validation.data;

      try {
        // Calculate subscription end date
        const endDate = new Date();
        if (plan === "monthly") {
          endDate.setMonth(endDate.getMonth() + 1);
        } else {
          endDate.setFullYear(endDate.getFullYear() + 1);
        }

        // Update user subscription
        const [updated] = await app.db
          .update(authSchema.user)
          .set({
            subscriptionStatus: plan,
            subscriptionEndDate: endDate,
          })
          .where(eq(authSchema.user.id, session.user.id))
          .returning();

        // Create transaction record
        await app.db.insert(appSchema.creditTransactions).values({
          userId: session.user.id,
          amount: 0,
          transactionType: "subscription_granted",
          description: `${plan === "monthly" ? "Monthly" : "Yearly"} subscription activated via ${request.body.paymentMethod.toUpperCase()} (ref: ${transactionReference})`,
        });

        app.logger.info(
          { userId: session.user.id, plan, endDate },
          "Manual payment confirmed, subscription activated"
        );

        return {
          success: true,
          subscriptionStatus: updated.subscriptionStatus,
          subscriptionEndDate: updated.subscriptionEndDate?.toISOString(),
        };
      } catch (error) {
        app.logger.error(
          { err: error, userId: session.user.id },
          "Failed to confirm payment"
        );
        throw error;
      }
    }
  );
}
