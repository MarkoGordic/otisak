import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { ErrorBoundary } from './components/ErrorBoundary';

// Student hot path stays eager so there is no chunk-load delay during the
// exam-taking flow (entry, join, exam, results).
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import JoinPage from './pages/JoinPage';
import ExamPage from './pages/ExamPage';
import ResultsPage from './pages/ResultsPage';

// Admin / management / docs load on demand. This keeps the initial bundle small
// and, in particular, defers the heavy markdown stack (react-markdown, remark,
// rehype) into the DocsPage chunk instead of the entry bundle.
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const ManagePage = lazy(() => import('./pages/ManagePage'));
const ExamEditPage = lazy(() => import('./pages/ExamEditPage'));
const AdminHomePage = lazy(() => import('./pages/AdminHomePage'));
const RoomPage = lazy(() => import('./pages/RoomPage'));
const ReportPage = lazy(() => import('./pages/ReportPage'));
const SubjectsPage = lazy(() => import('./pages/SubjectsPage'));
const QuestionsPage = lazy(() => import('./pages/QuestionsPage'));
const AdminUsersPage = lazy(() => import('./pages/AdminUsersPage'));
const AdminSettingsPage = lazy(() => import('./pages/AdminSettingsPage'));
const AdminErrorsPage = lazy(() => import('./pages/AdminErrorsPage'));
const DocsPage = lazy(() => import('./pages/DocsPage'));
const UserProfilePage = lazy(() => import('./pages/UserProfilePage'));
const ExamStatsPage = lazy(() => import('./pages/ExamStatsPage'));

function RouteFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg-secondary)]">
      <Loader2 className="w-6 h-6 animate-spin text-accent" />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/admin" element={<LoginPage />} />
          <Route path="/admin/home" element={<AdminHomePage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/manage" element={<ManagePage />} />
          <Route path="/manage/:examId" element={<RoomPage />} />
          <Route path="/manage/:examId/edit" element={<ExamEditPage />} />
          <Route path="/manage/:examId/report/:userId" element={<ReportPage />} />
          <Route path="/manage/:examId/stats" element={<ExamStatsPage />} />
          <Route path="/subjects" element={<SubjectsPage />} />
          <Route path="/questions" element={<QuestionsPage />} />
          <Route path="/admin/users" element={<AdminUsersPage />} />
          <Route path="/admin/settings" element={<AdminSettingsPage />} />
          <Route path="/admin/logs" element={<AdminErrorsPage />} />
          <Route path="/users/:userId" element={<UserProfilePage />} />
          <Route path="/exam/:examId" element={<ExamPage />} />
          <Route path="/exam/:examId/results" element={<ResultsPage />} />
          <Route path="/join/:examId" element={<JoinPage />} />
          {/* Documentation - public. lang is required in the URL after first hit. */}
          <Route path="/docs" element={<DocsPage />} />
          <Route path="/docs/:lang" element={<DocsPage />} />
          <Route path="/docs/:lang/*" element={<DocsPage />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}
