// When Vercel cron starts the daily job (spec section 12, "The daily job as built"): vercel.json's
// schedule, `0 4 * * *`. On the Hobby plan a daily job runs at any moment within its hour, so
// pages say it runs "around" the hour (decision row of 2026-10-08, v16). lib/jobs/schedule.test.ts
// holds this to vercel.json.

export const DAILY_JOB_CRON = '0 4 * * *';
export const DAILY_JOB_TIME = '04:00 UTC';
