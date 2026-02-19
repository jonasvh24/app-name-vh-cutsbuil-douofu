import { createApplication } from "@specific-dev/framework";
import * as appSchema from './db/schema/schema.js';
import * as authSchema from './db/schema/auth-schema.js';
import { registerVideoRoutes } from './routes/videos.js';
import { registerSubscriptionRoutes } from './routes/subscriptions.js';

const schema = { ...appSchema, ...authSchema };

export const app = await createApplication(schema);

export type App = typeof app;

app.withAuth();
app.withStorage();

registerVideoRoutes(app);
registerSubscriptionRoutes(app);

await app.run();
app.logger.info('VH Cuts application running');
