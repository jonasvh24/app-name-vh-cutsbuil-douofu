import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const videoProjects = pgTable('video_projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull(),
  originalVideoUrl: text('original_video_url').notNull(),
  editedVideoUrl: text('edited_video_url'),
  prompt: text('prompt').notNull(),
  status: text('status').default('processing').notNull(),
  title: text('title'),
  description: text('description'),
  hashtags: text('hashtags'),
  thumbnailUrl: text('thumbnail_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
});
