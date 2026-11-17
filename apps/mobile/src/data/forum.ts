/** Usta Forumu veri katmanı: demo sürümde bu cihazda, gerçek sürümde Supabase. */
import { serviceRepo } from './business-store';
import { ForumDemoRepo } from './forum-demo-repo';
import type { ForumRepo } from './forum-repo';
import { ForumSupabaseRepo } from './forum-supabase-repo';
import { repo } from './store';
import type { SupabaseRepo } from './supabase-repo';
import { env } from '@/lib/env';

export const forumRepo: ForumRepo = env.isDemo ? new ForumDemoRepo(serviceRepo) : new ForumSupabaseRepo((repo as SupabaseRepo).sb);
