import { Routes, Route } from 'react-router-dom';
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import ManagePage from './pages/ManagePage';
import RoomPage from './pages/RoomPage';
import ReportPage from './pages/ReportPage';
import SubjectsPage from './pages/SubjectsPage';
import QuestionsPage from './pages/QuestionsPage';
import AdminUsersPage from './pages/AdminUsersPage';
import AdminSettingsPage from './pages/AdminSettingsPage';
import ExamPage from './pages/ExamPage';
import ResultsPage from './pages/ResultsPage';
import JoinPage from './pages/JoinPage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/dashboard" element={<DashboardPage />} />
      <Route path="/manage" element={<ManagePage />} />
      <Route path="/manage/:examId" element={<RoomPage />} />
      <Route path="/manage/:examId/report/:userId" element={<ReportPage />} />
      <Route path="/subjects" element={<SubjectsPage />} />
      <Route path="/questions" element={<QuestionsPage />} />
      <Route path="/admin/users" element={<AdminUsersPage />} />
      <Route path="/admin/settings" element={<AdminSettingsPage />} />
      <Route path="/exam/:examId" element={<ExamPage />} />
      <Route path="/exam/:examId/results" element={<ResultsPage />} />
      <Route path="/join/:examId" element={<JoinPage />} />
    </Routes>
  );
}
