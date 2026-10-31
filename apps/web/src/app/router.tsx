import { createRootRoute, createRoute, createRouter } from '@tanstack/react-router';
import { Dashboard } from '../features/dashboard/Dashboard';
import { MedalPage } from '../features/medal/MedalPage';
import { MemoriesPage } from '../features/memories/MemoriesPage';
import { QuickAddPage } from '../features/quickadd/QuickAddPage';
import { MorePage } from '../features/placeholder/MorePage';
import { SectionPlaceholder } from '../features/placeholder/SectionPlaceholder';
import { ProfilePage } from '../features/profile/ProfilePage';
import { HealthPage } from '../features/health/HealthPage';
import { ExpensesPage } from '../features/daily/ExpensesPage';
import { DocumentsPage } from '../features/documents/DocumentsPage';
import { CalendarPage } from '../features/calendar/CalendarPage';
import { FeedingPage } from '../features/daily/FeedingPage';
import { TrainingPage } from '../features/daily/TrainingPage';
import { SettingsPage } from '../features/settings/SettingsPage';
import { NAV } from './navigation';
import { Shell } from './Shell';

const rootRoute = createRootRoute({ component: Shell });

const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: Dashboard });
const settingsRoute = createRoute({ getParentRoute: () => rootRoute, path: '/reglages', component: SettingsPage });
const profileRoute = createRoute({ getParentRoute: () => rootRoute, path: '/profil', component: ProfilePage });
const healthRoute = createRoute({ getParentRoute: () => rootRoute, path: '/sante', component: HealthPage });
const feedingRoute = createRoute({ getParentRoute: () => rootRoute, path: '/alimentation', component: FeedingPage });
const trainingRoute = createRoute({ getParentRoute: () => rootRoute, path: '/education', component: TrainingPage });
const expensesRoute = createRoute({ getParentRoute: () => rootRoute, path: '/depenses', component: ExpensesPage });
const documentsRoute = createRoute({ getParentRoute: () => rootRoute, path: '/documents', component: DocumentsPage });
const calendarRoute = createRoute({ getParentRoute: () => rootRoute, path: '/calendrier', component: CalendarPage });
const medalRoute = createRoute({ getParentRoute: () => rootRoute, path: '/medaille', component: MedalPage });
const memoriesRoute = createRoute({ getParentRoute: () => rootRoute, path: '/souvenirs', component: MemoriesPage });
const moreRoute = createRoute({ getParentRoute: () => rootRoute, path: '/plus', component: MorePage });
const addRoute = createRoute({ getParentRoute: () => rootRoute, path: '/ajouter', component: QuickAddPage });

// Sections prévues dans les phases suivantes.
const sectionRoutes = NAV.filter((entry) => entry.phase).map((entry) =>
  createRoute({
    getParentRoute: () => rootRoute,
    path: entry.to,
    component: () => <SectionPlaceholder entry={entry} />,
  }),
);

const routeTree = rootRoute.addChildren([indexRoute, profileRoute, healthRoute, feedingRoute, trainingRoute, expensesRoute, documentsRoute, calendarRoute, settingsRoute, medalRoute, memoriesRoute, moreRoute, addRoute, ...sectionRoutes]);

export const router = createRouter({
  routeTree,
  defaultNotFoundComponent: () => (
    <SectionPlaceholder entry={{ to: '/', label: 'Page introuvable', icon: 'home', description: 'Cette page n’existe pas.' }} />
  ),
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
