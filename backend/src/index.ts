import { createApplication } from "@specific-dev/framework";
import { eq } from "drizzle-orm";
import * as appSchema from './db/schema/schema.js';
import * as authSchema from './db/schema/auth-schema.js';
import { registerVideoRoutes } from './routes/videos.js';
import { registerSubscriptionRoutes } from './routes/subscriptions.js';
import { registerPaymentRoutes } from './routes/payments.js';
import { registerMusicRoutes } from './routes/music.js';
import { registerEditingRoutes } from './routes/editing.js';
import { registerSocialRoutes } from './routes/social.js';

const schema = { ...appSchema, ...authSchema };

export const app = await createApplication(schema);

export type App = typeof app;

app.withAuth();
app.withStorage();

// Grant infinite credits to special user on startup
async function initializeSpecialUser() {
  try {
    const specialEmail = 'jonas.v.huyssteen@gmail.com';
    const infiniteDate = new Date('2099-12-31T23:59:59Z');

    const user = await app.db
      .select()
      .from(authSchema.user)
      .where(eq(authSchema.user.email, specialEmail));

    if (user.length > 0) {
      await app.db
        .update(authSchema.user)
        .set({
          subscriptionStatus: 'yearly',
          subscriptionEndDate: infiniteDate,
          credits: 999999,
        })
        .where(eq(authSchema.user.email, specialEmail));

      app.logger.info({ email: specialEmail }, 'Granted infinite credits to special user');
    }
  } catch (error) {
    app.logger.error({ err: error }, 'Failed to initialize special user');
  }
}

registerVideoRoutes(app);
registerSubscriptionRoutes(app);
registerPaymentRoutes(app);
registerMusicRoutes(app);
registerEditingRoutes(app);
registerSocialRoutes(app);

await initializeSpecialUser();

await app.run();
app.logger.info('VH Cuts application running');
