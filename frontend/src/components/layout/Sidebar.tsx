import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Home, Sliders, Settings } from 'lucide-react';
import { useSettings } from '../../store/SettingsContext';
import { APP_NAME } from '../../config/brand';

interface SidebarProps {
  onCloseMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ onCloseMobile }) => {
  const { settings } = useSettings();
  const location = useLocation();

  const navItems = [
    {
      to: '/',
      label: 'Home',
      icon: Home,
      isActive: location.pathname === '/',
    },
    {
      to: '/editor',
      label: 'Editor',
      icon: Sliders,
      isActive: location.pathname.startsWith('/editor') || location.pathname.startsWith('/workspace'),
    },
    {
      to: '/settings',
      label: 'Settings',
      icon: Settings,
      isActive: location.pathname.startsWith('/settings'),
    },
  ];

  return (
    <aside className="w-56 h-full flex flex-col bg-studio-surface border-r border-studio-border select-none z-20">
      {/* Brand Header */}
      <div className="h-14 flex items-center px-4 border-b border-studio-border">
        <img src="/editron-logo.png" alt={APP_NAME} className="h-7 w-auto max-w-[155px] object-contain" />
      </div>

      {/* Main Navigation: Exactly 3 items */}
      <nav className="flex-1 py-4 px-2 space-y-1">
        {navItems.map((item) => {
          const active = item.isActive;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={onCloseMobile}
              className={`flex items-center gap-2.5 px-3 py-2 rounded text-xs font-medium transition-colors ${
                active
                  ? 'bg-studio-raised text-studio-accent border border-studio-border'
                  : 'text-studio-muted hover:text-studio-text hover:bg-studio-raised/50 border border-transparent'
              }`}
            >
              <item.icon
                className={`w-4 h-4 flex-shrink-0 ${
                  active ? 'text-studio-accent' : 'text-studio-muted'
                }`}
              />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      {/* Profile Area */}
      <div className="p-3 border-t border-studio-border">
        <NavLink
          to="/settings?tab=profile"
          onClick={onCloseMobile}
          className="flex items-center gap-2.5 p-1.5 rounded hover:bg-studio-raised transition-colors"
        >
          <div className="w-7 h-7 rounded bg-studio-raised border border-studio-border flex items-center justify-center font-mono text-[10px] font-semibold text-studio-accent">
            {settings.profile.avatarInitials || 'ME'}
          </div>
          <div className="flex flex-col min-w-0 flex-1">
            <span className="text-xs font-medium text-studio-text truncate">
              {settings.profile.name || 'Profile'}
            </span>
            <span className="text-[10px] text-studio-muted truncate">
              {settings.profile.workspaceName || 'Workstation'}
            </span>
          </div>
        </NavLink>
      </div>
    </aside>
  );
};
