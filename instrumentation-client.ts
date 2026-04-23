import posthog from 'posthog-js'

if (
  typeof window !== 'undefined' &&
  process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN &&
  process.env.NEXT_PUBLIC_POSTHOG_HOST
) {
  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    defaults: '2026-01-30',
  })
}