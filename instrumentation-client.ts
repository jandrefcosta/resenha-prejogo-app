import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  sendDefaultPii: false,

  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,

  replaysSessionSampleRate: 0.05,
  replaysOnErrorSampleRate: 0.25,

  enableLogs: true,

  integrations: [
    Sentry.replayIntegration(),
  ],
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
