import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout } from '../../components/layout/AppLayout';
import { HomePage } from '../../features/home/HomePage';
import { EditorPage } from '../../features/editor/EditorPage';
import { SettingsPage } from '../../features/settings/SettingsPage';

export const AppRouter: React.FC = () => {
  return (
    <Routes>
      <Route path="/" element={<AppLayout />}>
        {/* Exactly 3 main pages */}
        <Route index element={<HomePage />} />
        <Route path="editor" element={<EditorPage />} />
        <Route path="editor/:projectId" element={<EditorPage />} />
        <Route path="settings" element={<SettingsPage />} />

        {/* Workspace aliases forward directly to Editor */}
        <Route path="workspace" element={<EditorPage />} />
        <Route path="workspace/:projectId" element={<EditorPage />} />

        {/* Deleted pages / Old URLs redirect to Home */}
        <Route path="projects" element={<Navigate to="/" replace />} />
        <Route path="projects/*" element={<Navigate to="/" replace />} />
        <Route path="templates" element={<Navigate to="/" replace />} />
        <Route path="brand-assets" element={<Navigate to="/" replace />} />
        <Route path="brand" element={<Navigate to="/" replace />} />
        <Route path="dashboard" element={<Navigate to="/" replace />} />

        {/* Fallback to Home */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
};
