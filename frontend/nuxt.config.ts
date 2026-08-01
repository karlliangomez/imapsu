//@ts-nocheck

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: ['@nuxt/ui'],
  icon: {
    serverBundle: 'local',
    clientBundle: {
      scan: true,
      collections: ['lucide']
    }
  },
  css: ['~/assets/css/main.css'],
  runtimeConfig: {
    public: {
      strapiUrl: process.env.NUXT_PUBLIC_STRAPI_URL || 'http://localhost:1337'
    }
  }
})