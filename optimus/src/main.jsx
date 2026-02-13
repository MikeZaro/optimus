import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import ChatApp from './ChatApp.jsx'
import CalendarApp from './CalendarApp.jsx'
import HabitsApp from './HabitsApp.jsx'
import HealthApp from './HealthApp.jsx'
import GoalsDashboard from './GoalsDashboard.jsx'
import Journeys from './Journeys.jsx'

// Simple router based on URL path
// Use /chat for the Claude chat interface
// Use /habits for the habit tracker
// Use /health for the health dashboard
// Use /calendar for the calendar
// Use /goals-dashboard for the goals dashboard
// Use /journeys for watercolor habit journeys
// Use / for the productivity dashboard
const path = window.location.pathname;
const RootComponent = path === '/chat'
  ? ChatApp
  : path === '/calendar'
  ? CalendarApp
  : path === '/habits'
  ? HabitsApp
  : path === '/health'
  ? HealthApp
  : path === '/goals-dashboard'
  ? GoalsDashboard
  : path === '/journeys'
  ? Journeys
  : App;

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <RootComponent />
  </StrictMode>,
)
