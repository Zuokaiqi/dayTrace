import { createApp } from 'vue'
import { createPinia } from 'pinia'
import router from './router'
import App from './App.vue'
import './styles/variables.css'
import './styles/base.css'
import './styles/topbar.css'
import './styles/toast.css'
import './styles/day-view.css'
import './styles/week-month.css'
import './styles/popover.css'
import './styles/goals-panel.css'
import './styles/review-panel.css'
import './styles/mobile.css'
import './styles/ai-panel.css'

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.mount('#app')

// Register service worker for PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js').catch(() => {})
  })
}
