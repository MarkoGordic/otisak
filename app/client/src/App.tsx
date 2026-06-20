import { Routes, Route } from 'react-router-dom';
import { ErrorBoundary } from './components/ErrorBoundary';
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import ManagePage from './pages/ManagePage';
import ExamEditPage from './pages/ExamEditPage';
import AdminHomePage from './pages/AdminHomePage';
import RoomPage from './pages/RoomPage';
import ReportPage from './pages/ReportPage';
import SubjectsPage from './pages/SubjectsPage';
import QuestionsPage from './pages/QuestionsPage';
import AdminUsersPage from './pages/AdminUsersPage';
import AdminSettingsPage from './pages/AdminSettingsPage';
import ExamPage from './pages/ExamPage';
import ResultsPage from './pages/ResultsPage';
import JoinPage from './pages/JoinPage';
import DocsPage from './pages/DocsPage';
import UserProfilePage from './pages/UserProfilePage';
import ExamStatsPage from './pages/ExamStatsPage';

export default function App() {
  return (
    <ErrorBoundary>
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
        <Route path="/users/:userId" element={<UserProfilePage />} />
        <Route path="/exam/:examId" element={<ExamPage />} />
        <Route path="/exam/:examId/results" element={<ResultsPage />} />
        <Route path="/join/:examId" element={<JoinPage />} />
        {/* Documentation — public. lang is required in the URL after first hit. */}
        <Route path="/docs" element={<DocsPage />} />
        <Route path="/docs/:lang" element={<DocsPage />} />
        <Route path="/docs/:lang/*" element={<DocsPage />} />
      </Routes>
    </ErrorBoundary>
  );
}
